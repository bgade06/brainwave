import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors/app-error.js";
import { hashToken, randomToken } from "../auth/crypto.js";

const STATE_TTL = 10 * 60 * 1000;
const adf = (text) => ({
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const publicConnection = (connection) => connection ? {
  id: String(connection._id ?? connection.id),
  cloudId: connection.cloudId,
  siteName: connection.siteName,
  siteUrl: connection.siteUrl,
  connectedAt: connection.createdAt,
} : null;

export function verifyJiraSignature(rawBody, signature, secret) {
  const [algorithm, supplied] = String(signature ?? "").split("=");
  if (!["sha256", "sha384", "sha512"].includes(algorithm) || !supplied) return false;
  const expected = createHmac(algorithm, secret).update(rawBody).digest("hex");
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createJiraService({
  repository, provider, cipher, apiBaseUrl, clientUrl, preferredCloudId,
}) {
  const redirectUri = `${apiBaseUrl.replace(/\/+$/, "")}/integrations/jira/callback`;
  const refreshes = new Map();

  async function connectionWithToken(organizationId) {
    let connection = await repository.findConnection(organizationId, true);
    if (!connection) throw new AppError(404, "JIRA_NOT_CONNECTED", "Jira is not connected");
    if (new Date(connection.accessTokenExpiresAt).getTime() > Date.now() + 60_000) {
      return { connection, accessToken: cipher.decrypt(connection.accessToken) };
    }
    const id = String(connection._id ?? connection.id);
    if (!refreshes.has(id)) {
      const currentRefreshToken = connection.refreshToken;
      refreshes.set(id, (async () => {
        const refreshed = await provider.refresh(cipher.decrypt(currentRefreshToken));
        const args = [
          connection._id ?? connection.id,
          cipher.encrypt(refreshed.access_token),
          cipher.encrypt(refreshed.refresh_token),
          new Date(Date.now() + refreshed.expires_in * 1000),
        ];
        const updated = typeof repository.updateTokensIfCurrent === "function"
          ? await repository.updateTokensIfCurrent(
            args[0], currentRefreshToken, args[1], args[2], args[3],
          )
          : await repository.updateTokens(...args);
        if (updated) return { connection: updated, accessToken: refreshed.access_token };
        const winner = await repository.findConnection(organizationId, true);
        return { connection: winner, accessToken: cipher.decrypt(winner.accessToken) };
      })().finally(() => refreshes.delete(id)));
    }
    return refreshes.get(id);
  }

  return {
    async status(organizationId) {
      const connection = await repository.findConnection(organizationId);
      return {
        connected: Boolean(connection),
        ...(connection ? publicConnection(connection) : {}),
      };
    },
    async connect(organizationId, userId, requestedCloudId) {
      const state = randomToken();
      const browserNonce = randomToken();
      await repository.createState({
        stateHash: hashToken(state),
        browserNonceHash: hashToken(browserNonce),
        organizationId,
        userId,
        requestedCloudId,
        expiresAt: new Date(Date.now() + STATE_TTL),
      });
      return {
        url: provider.authorizationUrl({ redirectUri, state }),
        browserNonce,
      };
    },
    async callback({ state, code, browserNonce, organizationId, userId, cloudId }) {
      const saved = await repository.consumeState(
        hashToken(state ?? ""), hashToken(browserNonce ?? ""),
      );
      if (!saved ||
        String(saved.organizationId) !== String(organizationId) ||
        String(saved.userId) !== String(userId)) {
        throw new AppError(400, "JIRA_OAUTH_STATE_INVALID", "Jira OAuth state is invalid or expired");
      }
      const tokens = await provider.exchangeCode({ code, redirectUri });
      const resources = await provider.accessibleResources(tokens.access_token);
      const selectedId = cloudId ?? saved.requestedCloudId ?? preferredCloudId;
      const site = selectedId
        ? resources.find((resource) => resource.id === selectedId)
        : [...resources].sort((left, right) =>
            String(left.url).localeCompare(String(right.url)))[0] ?? null;
      if (!site) {
        throw new AppError(
          409,
          "JIRA_SITE_SELECTION_REQUIRED",
          "Select an accessible Jira site",
          { sites: resources.map(({ id, name, url }) => ({ id, name, url })) },
        );
      }
      const webhookSecret = randomBytes(32).toString("base64url");
      const prior = await repository.findConnection(organizationId, true);
      if (prior && prior.cloudId !== site.id) {
        throw new AppError(
          409,
          "JIRA_SITE_CHANGE_REQUIRES_DISCONNECT",
          "Disconnect the current Jira site before connecting a different site",
        );
      }
      const input = {
        connectedByUserId: userId,
        cloudId: site.id,
        siteName: site.name,
        siteUrl: site.url,
        scopes: site.scopes ?? [],
        accessToken: cipher.encrypt(tokens.access_token),
        refreshToken: cipher.encrypt(tokens.refresh_token),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        webhookSecret: cipher.encrypt(webhookSecret),
      };
      let connection = prior;
      let registeredWebhookId;
      if (typeof provider.registerWebhook === "function") {
        try {
          if (!connection) {
            connection = await repository.upsertConnection(organizationId, input);
          }
          const webhook = await provider.registerWebhook({
            cloudId: site.id,
            accessToken: tokens.access_token,
            url: `${apiBaseUrl.replace(/\/+$/, "")}/webhooks/jira/${connection._id ?? connection.id}`,
            secret: webhookSecret,
          });
          if (prior) connection = await repository.upsertConnection(organizationId, input);
          const webhookId = webhook.id ?? webhook.self?.split("/").at(-1);
          registeredWebhookId = webhookId ? String(webhookId) : undefined;
          if (webhookId) {
            await repository.setWebhookId(connection._id ?? connection.id, String(webhookId));
          }
        } catch (error) {
          if (registeredWebhookId && typeof provider.unregisterWebhook === "function") {
            try {
              await provider.unregisterWebhook({
                cloudId: site.id,
                accessToken: tokens.access_token,
                webhookId: registeredWebhookId,
              });
            } catch {
              // The original promotion failure remains authoritative.
            }
          }
          if (!prior) await repository.disconnect(organizationId);
          throw error;
        }
      } else {
        connection = await repository.upsertConnection(organizationId, input);
      }
      if (prior?.webhookId && typeof provider.unregisterWebhook === "function") {
        try {
          await provider.unregisterWebhook({
            cloudId: prior.cloudId,
            accessToken: cipher.decrypt(prior.accessToken),
            webhookId: prior.webhookId,
          });
        } catch {
          // The new healthy connection is authoritative; the old signed endpoint uses the
          // same connection id and its old secret no longer verifies.
        }
      }
      return { connection: publicConnection(connection), redirectUrl: clientUrl };
    },
    async disconnect(organizationId) {
      const { connection, accessToken } = await connectionWithToken(organizationId);
      if (connection.webhookId && typeof provider.unregisterWebhook === "function") {
        await provider.unregisterWebhook({
          cloudId: connection.cloudId,
          accessToken,
          webhookId: connection.webhookId,
        });
      }
      await repository.disconnect(organizationId);
      return { connected: false };
    },
    async projects(organizationId) {
      const { connection, accessToken } = await connectionWithToken(organizationId);
      const result = await provider.listProjects({ cloudId: connection.cloudId, accessToken });
      return result.values ?? result;
    },
    async createIssue(organizationId, actionItemId, { projectKey, issueTypeId }) {
      const actionItem = await repository.findActionItem(organizationId, actionItemId);
      if (!actionItem) throw new AppError(404, "ACTION_ITEM_NOT_FOUND", "Action item not found");
      const { connection, accessToken } = await connectionWithToken(organizationId);
      const storedIssueType = issueTypeId ?? "Task";
      const correlationLabel = `brainwave-${String(actionItemId).toLowerCase()}`;
      let reserved = await repository.reserveMapping({
        organizationId,
        actionItemId,
        connectionId: connection._id ?? connection.id,
        projectKey,
        issueTypeId: storedIssueType,
        syncStatus: "creating",
        correlationLabel,
      });
      if (!reserved.created) {
        if (reserved.mapping.syncStatus === "synced") {
          return repository.updateActionJira(organizationId, actionItemId, {
            jiraIssueId: reserved.mapping.jiraIssueId,
            jiraIssueKey: reserved.mapping.jiraIssueKey,
            jiraIssueUrl: reserved.mapping.jiraIssueUrl,
            jiraSyncStatus: "synced",
            jiraSyncedAt: new Date(),
          });
        }
        if (typeof provider.findIssueByCorrelation === "function") {
          const issue = await provider.findIssueByCorrelation({
            cloudId: connection.cloudId,
            accessToken,
            projectKey: reserved.mapping.projectKey,
            correlationLabel: reserved.mapping.correlationLabel,
          });
          if (issue) {
            const jiraIssueUrl = `${connection.siteUrl}/browse/${issue.key}`;
            await repository.completeMapping(reserved.mapping._id, {
              jiraIssueId: issue.id, jiraIssueKey: issue.key, jiraIssueUrl,
            });
            return repository.updateActionJira(organizationId, actionItemId, {
              jiraIssueId: issue.id, jiraIssueKey: issue.key, jiraIssueUrl,
              jiraSyncStatus: "synced", jiraSyncedAt: new Date(),
            });
          }
          if (
            typeof repository.recordReconciliationMiss === "function" &&
            typeof repository.reclaimMapping === "function"
          ) {
            const reconciled = await repository.recordReconciliationMiss(
              reserved.mapping._id,
              new Date(Date.now() - 5 * 60 * 1000),
            );
            if (reconciled?.reconciliationMisses >= 2) {
              const reclaimed = await repository.reclaimMapping(reserved.mapping._id);
              if (reclaimed) reserved = { mapping: reclaimed, created: true };
            }
          }
        }
        if (!reserved.created) {
          throw new AppError(
            409,
            "JIRA_CREATE_AMBIGUOUS",
            "A previous Jira create may have succeeded; retry after reconciliation completes",
          );
        }
      }
      try {
        const issue = await provider.createIssue({
          cloudId: connection.cloudId,
          accessToken,
          fields: {
            project: { key: projectKey },
            issuetype: issueTypeId ? { id: issueTypeId } : { name: "Task" },
            summary: actionItem.text.slice(0, 255),
            description: adf(actionItem.rationale || actionItem.text),
            labels: [correlationLabel],
          },
          properties: [{
            key: "brainwave.correlation",
            value: { organizationId: String(organizationId), actionItemId: String(actionItemId) },
          }],
        });
        const jiraIssueUrl = `${connection.siteUrl}/browse/${issue.key}`;
        const mapping = await repository.completeMapping(reserved.mapping._id, {
          jiraIssueId: issue.id, jiraIssueKey: issue.key, jiraIssueUrl,
        });
        const updatedActionItem = await repository.updateActionJira(
          organizationId,
          actionItemId,
          {
          jiraIssueId: issue.id,
          jiraIssueKey: issue.key,
          jiraIssueUrl,
          jiraSyncStatus: "synced",
          jiraSyncedAt: new Date(),
          },
        );
        return updatedActionItem;
      } catch (error) {
        await repository.failMapping(
          reserved.mapping._id,
          error.code ?? "JIRA_CREATE_AMBIGUOUS",
          "ambiguous",
        );
        throw error;
      }
    },
    async pushStatus(organizationId, actionItemId) {
      const actionItem = await repository.findActionItem(organizationId, actionItemId);
      if (!actionItem) throw new AppError(404, "ACTION_ITEM_NOT_FOUND", "Action item not found");
      const mapping = await repository.findMappingByAction(organizationId, actionItemId);
      if (!mapping?.jiraIssueKey) {
        throw new AppError(404, "JIRA_ISSUE_NOT_FOUND", "Action item has no Jira issue");
      }
      const { connection, accessToken } = await connectionWithToken(organizationId);
      if (String(mapping.connectionId) !== String(connection._id ?? connection.id)) {
        throw new AppError(
          409,
          "JIRA_MAPPING_CONNECTION_MISMATCH",
          "Jira mapping belongs to an inactive connection",
        );
      }
      await repository.setLastPushedStatus(mapping._id ?? mapping.id, actionItem.status);
      try {
        await provider.transitionIssue({
          cloudId: connection.cloudId,
          accessToken,
          issueKey: mapping.jiraIssueKey,
          status: actionItem.status,
        });
      } catch (error) {
        await repository.setLastPushedStatus(mapping._id ?? mapping.id, null);
        throw error;
      }
      return actionItem;
    },
    async webhook(connectionId, rawBody, headers) {
      const connection = await repository.findConnectionById(connectionId);
      if (!connection) throw new AppError(404, "JIRA_CONNECTION_NOT_FOUND", "Jira connection not found");
      const secret = cipher.decrypt(connection.webhookSecret);
      if (!verifyJiraSignature(rawBody, headers["x-hub-signature"], secret)) {
        throw new AppError(401, "JIRA_WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature");
      }
      let payload;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new AppError(400, "JIRA_WEBHOOK_INVALID_JSON", "Webhook body must be valid JSON");
      }
      const jiraUpdatedAt = new Date(payload.issue?.fields?.updated);
      const jiraStatus = payload.issue?.fields?.status?.statusCategory?.key;
      if (
        payload.webhookEvent !== "jira:issue_updated" ||
        !String(payload.issue?.id ?? "").trim() ||
        Number.isNaN(jiraUpdatedAt.getTime()) ||
        !["new", "indeterminate", "done"].includes(jiraStatus)
      ) {
        throw new AppError(
          400,
          "JIRA_WEBHOOK_PAYLOAD_INVALID",
          "Webhook payload is missing a supported issue update",
        );
      }
      const deliveryKey = headers["x-atlassian-webhook-identifier"] ??
        hashToken(rawBody);
      const inbox = await repository.insertWebhookEvent({
        connectionId,
        deliveryKey,
        jiraIssueId: String(payload.issue?.id ?? ""),
        jiraUpdatedAt,
        eventType: payload.webhookEvent,
      });
      if (!inbox.created) return { accepted: true, duplicate: true };
      try {
        const mapping = await repository.findMappingByIssue(
          connectionId, String(payload.issue?.id ?? ""),
        );
        if (!mapping) {
          await repository.completeWebhookEvent(inbox.event._id, "ignored");
          return { accepted: true, ignored: true };
        }
        const status = jiraStatus === "done" ? "done"
          : jiraStatus === "indeterminate" ? "in_progress" : "open";
        if (mapping.lastPushedStatus === status) {
          if (typeof repository.consumeLastPushedStatus === "function") {
            await repository.consumeLastPushedStatus(mapping._id, status);
          }
          await repository.completeWebhookEvent(inbox.event._id, "ignored");
          return { accepted: true, loopPrevented: true };
        }
        const applied = await repository.applyWebhookStatus(
          mapping._id,
          jiraUpdatedAt,
          status,
        );
        await repository.completeWebhookEvent(inbox.event._id, applied ? "processed" : "ignored");
        return { accepted: true, applied };
      } catch (error) {
        await repository.completeWebhookEvent(inbox.event._id, "failed");
        throw error;
      }
    },
  };
}

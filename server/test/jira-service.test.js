import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createTokenCipher } from "../src/auth/crypto.js";
import { createJiraService, verifyJiraSignature } from "../src/services/jira-service.js";

const orgId = "507f1f77bcf86cd799439002";
const userId = "507f1f77bcf86cd799439001";
const actionId = "507f191e810c19729de860ea";

function harness() {
  const cipher = createTokenCipher(Buffer.alloc(32, 4).toString("base64"));
  let state;
  let connection;
  let mapping;
  const actionItem = {
    _id: actionId, text: "Ship Jira integration", rationale: "Close the loop", status: "open",
  };
  const deliveries = new Set();
  const repository = {
    async createState(input) { state = { _id: "state-1", ...input }; },
    async consumeState(stateHash, browserNonceHash) {
      if (!state || state.stateHash !== stateHash || state.browserNonceHash !== browserNonceHash) {
        return null;
      }
      const result = state;
      state = null;
      return result;
    },
    async upsertConnection(organizationId, input) {
      connection = { _id: "connection-1", organizationId, createdAt: new Date(), ...input };
      return connection;
    },
    async findConnection(organizationId) {
      return connection?.organizationId === organizationId ? connection : null;
    },
    async updateTokens(_id, accessToken, refreshToken, accessTokenExpiresAt) {
      Object.assign(connection, { accessToken, refreshToken, accessTokenExpiresAt });
      return connection;
    },
    async updateTokensIfCurrent(
      _id, currentRefreshToken, accessToken, refreshToken, accessTokenExpiresAt,
    ) {
      if (connection.refreshToken !== currentRefreshToken) return null;
      Object.assign(connection, { accessToken, refreshToken, accessTokenExpiresAt });
      return connection;
    },
    async setWebhookId(_id, webhookId) { connection.webhookId = webhookId; },
    async disconnect() { connection = null; mapping = null; deliveries.clear(); },
    async findActionItem(organizationId, id) {
      return organizationId === orgId && id === actionId
        ? { ...actionItem }
        : null;
    },
    async reserveMapping(input) {
      if (mapping) return { mapping, created: false };
      mapping = { _id: "mapping-1", ...input };
      return { mapping, created: true };
    },
    async completeMapping(_id, input) {
      Object.assign(mapping, input, { syncStatus: "synced" });
      return mapping;
    },
    async failMapping(_id, errorCode, syncStatus = "error") {
      Object.assign(mapping, { errorCode, syncStatus });
    },
    async updateActionJira(_organizationId, _actionItemId, input) {
      Object.assign(actionItem, input);
      return { ...actionItem };
    },
    async findConnectionById(id) {
      return id === "connection-1" ? connection : null;
    },
    async insertWebhookEvent(input) {
      if (deliveries.has(input.deliveryKey)) return { created: false };
      deliveries.add(input.deliveryKey);
      return { created: true, event: { _id: `event-${deliveries.size}`, ...input } };
    },
    async findMappingByIssue(_connectionId, issueId) {
      return mapping?.jiraIssueId === issueId ? mapping : null;
    },
    async findMappingByAction(organizationId, id) {
      return mapping?.organizationId === organizationId && mapping?.actionItemId === id
        ? mapping : null;
    },
    async setLastPushedStatus(_id, status) { mapping.lastPushedStatus = status; },
    consumeLastPushedStatus: vi.fn(async (_id, status) => {
      if (mapping.lastPushedStatus !== status) return false;
      delete mapping.lastPushedStatus;
      return true;
    }),
    applyWebhookStatus: vi.fn(async () => true),
    async completeWebhookEvent() {},
  };
  const provider = {
    authorizationUrl: vi.fn(({ redirectUri, state: oauthState }) =>
      `https://auth.atlassian.test?redirect_uri=${redirectUri}&state=${oauthState}`),
    exchangeCode: vi.fn(async () => ({
      access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600,
    })),
    accessibleResources: vi.fn(async () => [
      { id: "cloud-1", name: "Primary", url: "https://primary.atlassian.net", scopes: [] },
      { id: "cloud-2", name: "Other", url: "https://other.atlassian.net", scopes: [] },
    ]),
    refresh: vi.fn(async () => ({
      access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600,
    })),
    listProjects: vi.fn(async () => ({ values: [{ id: "project-1", key: "BW" }] })),
    createIssue: vi.fn(async ({ fields }) => ({ id: "10001", key: "BW-1", fields })),
    registerWebhook: vi.fn(async () => ({ id: "webhook-1" })),
    transitionIssue: vi.fn(async () => {}),
    unregisterWebhook: vi.fn(async () => {}),
    findIssueByCorrelation: vi.fn(async () => null),
  };
  const service = createJiraService({
    repository,
    provider,
    cipher,
    apiBaseUrl: "https://api.example.com",
    clientUrl: "https://app.example.com",
  });
  return {
    service, provider, repository, cipher,
    get connection() { return connection; },
    get mapping() { return mapping; },
  };
}

describe("Jira integration service", () => {
  it("matches Atlassian's published webhook HMAC test vector", () => {
    expect(verifyJiraSignature(
      Buffer.from("Hello World!"),
      "sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9",
      "It's a Secret to Everybody",
    )).toBe(true);
  });

  it("binds one-time OAuth state to the browser and validates site selection", async () => {
    const test = harness();
    const started = await test.service.connect(orgId, userId, "cloud-1");
    await test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "code",
      browserNonce: started.browserNonce,
      organizationId: orgId,
      userId,
    });
    expect(test.connection.cloudId).toBe("cloud-1");
    expect(test.connection.webhookId).toBe("webhook-1");
    expect(test.provider.registerWebhook).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://api.example.com/webhooks/jira/connection-1",
      secret: expect.any(String),
    }));
    expect(test.connection.accessToken).not.toContain("access-1");
    expect(test.cipher.decrypt(test.connection.refreshToken)).toBe("refresh-1");
    await expect(test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "replay",
      browserNonce: started.browserNonce,
      organizationId: orgId,
      userId,
    })).rejects.toMatchObject({ code: "JIRA_OAUTH_STATE_INVALID" });
  });

  it("creates an issue once with ADF and returns the durable mapping on retries", async () => {
    const test = harness();
    const started = await test.service.connect(orgId, userId, "cloud-1");
    await test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "code",
      browserNonce: started.browserNonce,
      organizationId: orgId,
      userId,
    });
    const first = await test.service.createIssue(orgId, actionId, {
      projectKey: "BW", issueTypeId: "10001",
    });
    const retry = await test.service.createIssue(orgId, actionId, {
      projectKey: "BW", issueTypeId: "10001",
    });
    expect(test.provider.createIssue).toHaveBeenCalledTimes(1);
    expect(test.provider.createIssue.mock.calls[0][0].fields.description)
      .toMatchObject({ type: "doc", version: 1 });
    expect(first).toMatchObject({ jiraIssueKey: "BW-1", jiraSyncStatus: "synced" });
    expect(retry.jiraIssueKey).toBe(first.jiraIssueKey);
  });

  it("atomically replaces the rotating refresh token before API access", async () => {
    const test = harness();
    const started = await test.service.connect(orgId, userId, "cloud-1");
    await test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "code", browserNonce: started.browserNonce, organizationId: orgId, userId,
    });
    test.connection.accessTokenExpiresAt = new Date(0);
    const projects = await test.service.projects(orgId);
    expect(projects).toEqual([{ id: "project-1", key: "BW" }]);
    expect(test.provider.refresh).toHaveBeenCalledWith("refresh-1");
    expect(test.cipher.decrypt(test.connection.refreshToken)).toBe("refresh-2");
    expect(test.provider.listProjects).toHaveBeenCalledWith({
      cloudId: "cloud-1", accessToken: "access-2",
    });
  });

  it("pushes local status and sets the loop guard before Jira transition", async () => {
    const test = harness();
    const started = await test.service.connect(orgId, userId, "cloud-1");
    await test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "code", browserNonce: started.browserNonce, organizationId: orgId, userId,
    });
    await test.service.createIssue(orgId, actionId, {
      projectKey: "BW", issueTypeId: "10001",
    });
    const pushed = await test.service.pushStatus(orgId, actionId);
    expect(pushed.status).toBe("open");
    expect(test.mapping.lastPushedStatus).toBe("open");
    expect(test.provider.transitionIssue).toHaveBeenCalledWith(expect.objectContaining({
      issueKey: "BW-1",
    }));
  });

  it("deduplicates signed webhooks before applying status", async () => {
    const test = harness();
    const started = await test.service.connect(orgId, userId, "cloud-1");
    await test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "code", browserNonce: started.browserNonce, organizationId: orgId, userId,
    });
    await test.service.createIssue(orgId, actionId, {
      projectKey: "BW", issueTypeId: "10001",
    });
    const raw = Buffer.from(JSON.stringify({
      webhookEvent: "jira:issue_updated",
      issue: {
        id: "10001",
        fields: {
          updated: "2026-07-24T12:00:00.000Z",
          status: { statusCategory: { key: "done" } },
        },
      },
    }));
    const secret = test.cipher.decrypt(test.connection.webhookSecret);
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    const headers = {
      "x-hub-signature": signature,
      "x-atlassian-webhook-identifier": "delivery-1",
    };
    const first = await test.service.webhook("connection-1", raw, headers);
    const duplicate = await test.service.webhook("connection-1", raw, headers);
    expect(first.applied).toBe(true);
    expect(duplicate.duplicate).toBe(true);
    expect(test.repository.applyWebhookStatus).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent rotating-token refreshes", async () => {
    const test = harness();
    const started = await test.service.connect(orgId, userId, "cloud-1");
    await test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "code", browserNonce: started.browserNonce, organizationId: orgId, userId,
    });
    test.connection.accessTokenExpiresAt = new Date(0);
    await Promise.all([test.service.projects(orgId), test.service.projects(orgId)]);
    expect(test.provider.refresh).toHaveBeenCalledTimes(1);
  });

  it("preserves a healthy connection when reconnect webhook registration fails", async () => {
    const test = harness();
    let started = await test.service.connect(orgId, userId, "cloud-1");
    await test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "first", browserNonce: started.browserNonce, organizationId: orgId, userId,
    });
    const healthyToken = test.connection.accessToken;
    test.provider.registerWebhook.mockRejectedValueOnce(new Error("registration failed"));
    started = await test.service.connect(orgId, userId, "cloud-1");
    await expect(test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "second", browserNonce: started.browserNonce, organizationId: orgId, userId,
    })).rejects.toThrow("registration failed");
    expect(test.connection.cloudId).toBe("cloud-1");
    expect(test.connection.accessToken).toBe(healthyToken);
  });

  it("remotely unregisters before cleaning the local integration", async () => {
    const test = harness();
    const started = await test.service.connect(orgId, userId, "cloud-1");
    await test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "code", browserNonce: started.browserNonce, organizationId: orgId, userId,
    });
    await test.service.disconnect(orgId);
    expect(test.provider.unregisterWebhook).toHaveBeenCalledWith(expect.objectContaining({
      webhookId: "webhook-1", cloudId: "cloud-1",
    }));
    expect(test.connection).toBeNull();
  });

  it("consumes the loop marker and rejects inactive-connection mappings", async () => {
    const test = harness();
    const started = await test.service.connect(orgId, userId, "cloud-1");
    await test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "code", browserNonce: started.browserNonce, organizationId: orgId, userId,
    });
    await test.service.createIssue(orgId, actionId, {
      projectKey: "BW", issueTypeId: "10001",
    });
    await test.service.pushStatus(orgId, actionId);
    const raw = Buffer.from(JSON.stringify({
      webhookEvent: "jira:issue_updated",
      issue: {
        id: "10001",
        fields: {
          updated: "2026-07-24T12:00:00.000Z",
          status: { statusCategory: { key: "new" } },
        },
      },
    }));
    const secret = test.cipher.decrypt(test.connection.webhookSecret);
    const result = await test.service.webhook("connection-1", raw, {
      "x-hub-signature": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`,
      "x-atlassian-webhook-identifier": "loop-delivery",
    });
    expect(result.loopPrevented).toBe(true);
    expect(test.repository.consumeLastPushedStatus).toHaveBeenCalledWith("mapping-1", "open");
    expect(test.mapping.lastPushedStatus).toBeUndefined();

    test.mapping.connectionId = "old-connection";
    await expect(test.service.pushStatus(orgId, actionId)).rejects.toMatchObject({
      status: 409, code: "JIRA_MAPPING_CONNECTION_MISMATCH",
    });
  });

  it("does not duplicate a Jira issue after an ambiguous create failure", async () => {
    const test = harness();
    const started = await test.service.connect(orgId, userId, "cloud-1");
    await test.service.callback({
      state: new URL(started.url).searchParams.get("state"),
      code: "code", browserNonce: started.browserNonce, organizationId: orgId, userId,
    });
    test.provider.createIssue.mockRejectedValueOnce(new Error("timeout after send"));
    await expect(test.service.createIssue(orgId, actionId, {
      projectKey: "BW", issueTypeId: "10001",
    })).rejects.toThrow("timeout after send");
    await expect(test.service.createIssue(orgId, actionId, {
      projectKey: "BW", issueTypeId: "10001",
    })).rejects.toMatchObject({ status: 409, code: "JIRA_CREATE_AMBIGUOUS" });
    expect(test.provider.createIssue).toHaveBeenCalledTimes(1);
    expect(test.provider.findIssueByCorrelation).toHaveBeenCalledWith(expect.objectContaining({
      correlationLabel: `brainwave-${actionId}`,
    }));
  });
});

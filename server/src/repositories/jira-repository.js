import { ActionItem } from "../models/action-item.js";
import { JiraConnection } from "../models/jira-connection.js";
import { JiraIssueMapping } from "../models/jira-issue-mapping.js";
import { JiraOAuthState } from "../models/jira-oauth-state.js";
import { JiraWebhookEvent } from "../models/jira-webhook-event.js";

const plain = (doc) => doc?.toObject?.() ?? doc ?? null;

export const mongooseJiraRepository = {
  createState(input) { return JiraOAuthState.create(input); },
  consumeState(stateHash, browserNonceHash) {
    return JiraOAuthState.findOneAndDelete({
      stateHash, browserNonceHash, expiresAt: { $gt: new Date() },
    }).select("+stateHash +browserNonceHash");
  },
  upsertConnection(organizationId, input) {
    return JiraConnection.findOneAndUpdate(
      { organizationId },
      { $set: input },
      { upsert: true, new: true, runValidators: true },
    );
  },
  findConnection(organizationId, includeSecrets = false) {
    const query = JiraConnection.findOne({ organizationId });
    return includeSecrets
      ? query.select("+accessToken +refreshToken +webhookSecret")
      : query;
  },
  findConnectionById(id) {
    return JiraConnection.findById(id).select("+webhookSecret");
  },
  updateTokens(id, accessToken, refreshToken, accessTokenExpiresAt) {
    return JiraConnection.findByIdAndUpdate(id, {
      $set: { accessToken, refreshToken, accessTokenExpiresAt },
    }, { new: true }).select("+accessToken +refreshToken +webhookSecret");
  },
  updateTokensIfCurrent(id, currentRefreshToken, accessToken, refreshToken, accessTokenExpiresAt) {
    return JiraConnection.findOneAndUpdate(
      { _id: id, refreshToken: currentRefreshToken },
      { $set: { accessToken, refreshToken, accessTokenExpiresAt } },
      { new: true },
    ).select("+accessToken +refreshToken +webhookSecret");
  },
  setWebhookId(id, webhookId) {
    return JiraConnection.findByIdAndUpdate(id, { $set: { webhookId } }, { new: true });
  },
  async disconnect(organizationId) {
    const connection = await JiraConnection.findOneAndDelete({ organizationId });
    if (!connection) return;
    const mappings = await JiraIssueMapping.find({ organizationId }).select("actionItemId");
    await Promise.all([
      JiraWebhookEvent.deleteMany({ connectionId: connection._id }),
      JiraIssueMapping.deleteMany({ organizationId }),
      ActionItem.updateMany(
        { organizationId, _id: { $in: mappings.map((item) => item.actionItemId) } },
        {
          $unset: {
            jiraIssueId: 1, jiraIssueKey: 1, jiraIssueUrl: 1,
            jiraSyncedAt: 1, jiraLastUpdatedAt: 1,
          },
          $set: { jiraSyncStatus: "not_synced" },
        },
      ),
    ]);
  },
  findActionItem(organizationId, id) {
    return ActionItem.findOne({ _id: id, organizationId });
  },
  async reserveMapping(input) {
    try {
      return { mapping: await JiraIssueMapping.create(input), created: true };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return {
        mapping: await JiraIssueMapping.findOne({
          organizationId: input.organizationId, actionItemId: input.actionItemId,
        }),
        created: false,
      };
    }
  },
  completeMapping(id, input) {
    return JiraIssueMapping.findByIdAndUpdate(
      id, { $set: { ...input, syncStatus: "synced" } }, { new: true },
    );
  },
  failMapping(id, errorCode, syncStatus = "error") {
    return JiraIssueMapping.findByIdAndUpdate(
      id, { $set: { syncStatus, errorCode } }, { new: true },
    );
  },
  recordReconciliationMiss(id, retryAfter) {
    return JiraIssueMapping.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { lastReconciledAt: { $exists: false } },
          { lastReconciledAt: { $lte: retryAfter } },
        ],
      },
      {
        $inc: { reconciliationMisses: 1 },
        $set: { lastReconciledAt: new Date() },
      },
      { new: true },
    );
  },
  reclaimMapping(id) {
    return JiraIssueMapping.findOneAndUpdate(
      {
        _id: id,
        syncStatus: { $in: ["creating", "error", "ambiguous"] },
        reconciliationMisses: { $gte: 2 },
      },
      {
        $set: { syncStatus: "creating" },
        $unset: { errorCode: 1 },
      },
      { new: true },
    );
  },
  async updateActionJira(organizationId, actionItemId, input) {
    return plain(await ActionItem.findOneAndUpdate(
      { _id: actionItemId, organizationId }, { $set: input }, { new: true },
    ));
  },
  async insertWebhookEvent(input) {
    const processingExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    try {
      return {
        event: await JiraWebhookEvent.create({ ...input, processingExpiresAt }),
        created: true,
      };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const event = await JiraWebhookEvent.findOneAndUpdate(
        {
          connectionId: input.connectionId,
          deliveryKey: input.deliveryKey,
          $or: [
            { status: "failed" },
            { status: "received", processingExpiresAt: { $lte: new Date() } },
          ],
        },
        {
          $set: {
            status: "received",
            processingExpiresAt,
            processedAt: null,
          },
        },
        { new: true },
      );
      return { event, created: Boolean(event), retry: Boolean(event) };
    }
  },
  findMappingByIssue(connectionId, jiraIssueId) {
    return JiraIssueMapping.findOne({ connectionId, jiraIssueId });
  },
  findMappingByAction(organizationId, actionItemId) {
    return JiraIssueMapping.findOne({ organizationId, actionItemId });
  },
  setLastPushedStatus(id, status) {
    return JiraIssueMapping.findByIdAndUpdate(id, { $set: { lastPushedStatus: status } });
  },
  async consumeLastPushedStatus(id, status) {
    return Boolean(await JiraIssueMapping.findOneAndUpdate(
      { _id: id, lastPushedStatus: status },
      { $unset: { lastPushedStatus: 1 } },
      { new: true },
    ));
  },
  async applyWebhookStatus(mappingId, jiraUpdatedAt, status) {
    const mapping = await JiraIssueMapping.findById(mappingId);
    if (!mapping) return false;
    const actionItem = await ActionItem.findOneAndUpdate(
      {
        _id: mapping.actionItemId,
        organizationId: mapping.organizationId,
        $or: [
          { jiraLastUpdatedAt: { $exists: false } },
          { jiraLastUpdatedAt: { $lt: jiraUpdatedAt } },
        ],
      },
      {
        $set: {
          status,
          jiraLastUpdatedAt: jiraUpdatedAt,
          jiraSyncedAt: new Date(),
          jiraSyncStatus: "synced",
        },
      },
      { new: true },
    );
    if (!actionItem) return false;
    await JiraIssueMapping.updateOne(
      { _id: mappingId },
      { $max: { lastJiraUpdatedAt: jiraUpdatedAt } },
    );
    return true;
  },
  completeWebhookEvent(id, status) {
    return JiraWebhookEvent.findByIdAndUpdate(id, {
      $set: { status, processedAt: new Date() },
      $unset: { processingExpiresAt: 1 },
    });
  },
};

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

const topicId = "507f1f77bcf86cd799439011";
const itemId = "507f191e810c19729de860ea";
const orgId = "507f1f77bcf86cd799439002";
const userId = "507f1f77bcf86cd799439001";
const csrf = "development-csrf-token";

function harness() {
  const item = {
    id: itemId,
    topicId,
    organizationId: orgId,
    text: "Ship it",
    provenance: "manual",
    status: "open",
  };
  const actionItemService = {
    list: vi.fn(async () => [item]),
    createManual: vi.fn(async () => item),
    patch: vi.fn(async () => ({ ...item, priority: "high" })),
    claim: vi.fn(async () => ({ ...item, assigneeUserId: userId })),
    unclaim: vi.fn(async () => item),
  };
  return {
    actionItemService,
    app: createApp({
      config: { NODE_ENV: "test", AUTH_BYPASS: true },
      topicService: {},
      actionItemService,
    }),
  };
}

describe("action-item routes", () => {
  it("implements the topic list and manual-create envelopes", async () => {
    const { app, actionItemService } = harness();
    const listed = await request(app).get(`/topics/${topicId}/action-items`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(actionItemService.list).toHaveBeenCalledWith(orgId, topicId);

    const created = await request(app)
      .post(`/topics/${topicId}/action-items`)
      .set("x-csrf-token", csrf)
      .send({ text: "Ship it", priority: "high" });
    expect(created.status).toBe(201);
    expect(created.body.data.provenance).toBe("manual");
    expect(actionItemService.createManual).toHaveBeenCalledWith(orgId, topicId, {
      text: "Ship it", priority: "high",
    });
  });

  it("implements patch, claim, and unclaim with auth context", async () => {
    const { app, actionItemService } = harness();
    const patched = await request(app)
      .patch(`/action-items/${itemId}`)
      .set("x-csrf-token", csrf)
      .send({ priority: "high", rationale: "Critical" });
    expect(patched.status).toBe(200);
    expect(actionItemService.patch).toHaveBeenCalledWith(orgId, itemId, {
      priority: "high", rationale: "Critical", reopen: false,
    });

    const claimed = await request(app)
      .post(`/action-items/${itemId}/claim`)
      .set("x-csrf-token", csrf);
    expect(claimed.status).toBe(200);
    expect(actionItemService.claim).toHaveBeenCalledWith(orgId, itemId, userId);

    const unclaimed = await request(app)
      .delete(`/action-items/${itemId}/claim`)
      .set("x-csrf-token", csrf);
    expect(unclaimed.status).toBe(200);
    expect(actionItemService.unclaim).toHaveBeenCalledWith(orgId, itemId, userId);
  });

  it("rejects client-supplied provenance and missing CSRF", async () => {
    const { app } = harness();
    const provenance = await request(app)
      .post(`/topics/${topicId}/action-items`)
      .set("x-csrf-token", csrf)
      .send({ text: "Forged", provenance: "ai" });
    expect(provenance.status).toBe(400);

    const noCsrf = await request(app)
      .patch(`/action-items/${itemId}`)
      .send({ priority: "high" });
    expect(noCsrf.status).toBe(403);
  });
});

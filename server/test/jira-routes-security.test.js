import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

describe("Jira route authorization", () => {
  it("allows status but denies member connect, callback, and disconnect", async () => {
    const jiraService = {
      status: vi.fn(async () => ({ connected: false })),
      connect: vi.fn(),
      callback: vi.fn(),
      disconnect: vi.fn(),
    };
    const app = createApp({
      config: { NODE_ENV: "test", AUTH_BYPASS: true },
      bypassContext: {
        user: { id: "507f1f77bcf86cd799439001" },
        organization: { id: "507f1f77bcf86cd799439002" },
        role: "member",
        csrfToken: "csrf",
      },
      topicService: {},
      actionItemService: {},
      jiraService,
    });
    expect((await request(app).get("/integrations/jira/status")).status).toBe(200);
    expect((await request(app).get("/integrations/jira/connect")).status).toBe(403);
    expect((await request(app)
      .get("/integrations/jira/callback?state=x&code=x")).status).toBe(403);
    expect((await request(app)
      .delete("/integrations/jira")
      .set("x-csrf-token", "csrf")).status).toBe(403);
    expect(jiraService.connect).not.toHaveBeenCalled();
    expect(jiraService.callback).not.toHaveBeenCalled();
    expect(jiraService.disconnect).not.toHaveBeenCalled();
  });
});

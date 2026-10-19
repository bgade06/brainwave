import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createTopicService } from "../src/services/topic-service.js";

const topicId = "507f1f77bcf86cd799439011";
const missingId = "507f1f77bcf86cd799439012";
const organizationId = "507f1f77bcf86cd799439002";
const csrf = "development-csrf-token";

function buildTestApp() {
  const topics = [];
  const ideas = [];
  const topicRepository = {
    async create(orgId, input) {
      const topic = {
        _id: topicId, organizationId: orgId, ...input, createdAt: new Date().toISOString(),
      };
      topics.push(topic);
      return topic;
    },
    async list(orgId) {
      return topics.filter((topic) => topic.organizationId === orgId);
    },
    async findById(orgId, id) {
      return topics.find((topic) => topic.organizationId === orgId && topic._id === id) ?? null;
    },
  };
  const ideaRepository = {
    async create(orgId, input) {
      const idea = {
        _id: "507f191e810c19729de860ea",
        ...input, organizationId: orgId,
        createdAt: new Date().toISOString(),
      };
      ideas.push(idea);
      return idea;
    },
    async listByTopic(orgId, id) {
      return ideas.filter((idea) => idea.organizationId === orgId && idea.topicId === id);
    },
  };
  const topicService = createTopicService({ topicRepository, ideaRepository });
  return {
    app: createApp({ topicService, config: { NODE_ENV: "test", AUTH_BYPASS: true } }),
    topics,
    ideas,
  };
}

describe("Brainwave API", () => {
  it("reports health", async () => {
    const { app } = buildTestApp();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ok" } });
  });

  it("reports dependency readiness independently from liveness", async () => {
    const app = createApp({
      config: { NODE_ENV: "test", AUTH_BYPASS: true },
      readinessCheck: () => false,
    });
    const response = await request(app).get("/ready");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ data: { status: "not_ready" } });
  });

  it("creates, lists, and reads a topic", async () => {
    const { app } = buildTestApp();
    const created = await request(app).post("/topics").set("x-csrf-token", csrf).send({
      title: "Improve onboarding",
      goal: "Reduce time to value",
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      _id: topicId,
      title: "Improve onboarding",
      description: "",
    });

    const listed = await request(app).get("/topics");
    expect(listed.body.data).toHaveLength(1);

    const read = await request(app).get(`/topics/${topicId}`);
    expect(read.status).toBe(200);
    expect(read.body.data.title).toBe("Improve onboarding");
    expect(read.body.data.ideas).toEqual([]);
    expect(read.body.data.analysis).toBeNull();
  });

  it("rejects invalid topic input", async () => {
    const { app } = buildTestApp();
    const response = await request(app).post("/topics")
      .set("x-csrf-token", csrf).send({ title: "   " });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns a stable client error for malformed JSON", async () => {
    const { app } = buildTestApp();
    const response = await request(app)
      .post("/topics")
      .set("content-type", "application/json")
      .set("x-csrf-token", "development-csrf-token")
      .send("{not-json");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: "INVALID_JSON",
        requestId: expect.any(String),
      },
    });
  });

  it("returns a stable not-found error for an unknown topic", async () => {
    const { app } = buildTestApp();
    const response = await request(app).get(`/topics/${missingId}`);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: "TOPIC_NOT_FOUND",
        message: "Topic not found",
        requestId: expect.any(String),
      },
    });
  });

  it("adds an idea only to an existing topic", async () => {
    const { app, ideas } = buildTestApp();
    await request(app).post("/topics").set("x-csrf-token", csrf)
      .send({ title: "Launch ideas" });

    const created = await request(app)
      .post(`/topics/${topicId}/ideas`)
      .set("x-csrf-token", csrf)
      .send({ text: "Run a pilot", author: "Sam" });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      topicId,
      text: "Run a pilot",
      author: "Sam",
    });
    expect(ideas).toHaveLength(1);

    const missing = await request(app)
      .post(`/topics/${missingId}/ideas`)
      .set("x-csrf-token", csrf)
      .send({ text: "Should not persist" });
    expect(missing.status).toBe(404);
    expect(ideas).toHaveLength(1);
  });

  it("fails safely when analysis is not configured", async () => {
    const { app } = buildTestApp();
    await request(app).post("/topics").set("x-csrf-token", csrf)
      .send({ title: "Analyze me" });

    const response = await request(app).post(`/topics/${topicId}/analyze`)
      .set("x-csrf-token", csrf);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: {
        code: "AI_PROVIDER_UNCONFIGURED",
        message: "Topic analysis is unavailable until an AI provider is configured",
        requestId: expect.any(String),
      },
    });
  });
});

import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { validate } from "../middleware/validate.js";

const objectId = z.string().refine((value) => mongoose.isObjectIdOrHexString(value), {
  message: "Must be a valid object id",
});
const topicParams = z.object({ id: objectId });
const createTopicBody = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5_000).optional().default(""),
  goal: z.string().trim().max(1_000).optional().default(""),
}).strict();
const createIdeaBody = z.object({
  text: z.string().trim().min(1).max(5_000),
  author: z.string().trim().min(1).max(160).optional(),
}).strict();
const analyzeBody = z.object({
  regenerate: z.boolean().optional().default(false),
}).strict().default({});

export function createTopicRouter({ topicService, analysisService }) {
  const router = Router();

  router.post("/", validate(createTopicBody), async (request, response, next) => {
    try {
      response.status(201).json({
        data: await topicService.createTopic(request.auth.organization.id, request.body),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (request, response, next) => {
    try {
      response.json({ data: await topicService.listTopics(request.auth.organization.id) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", validate(topicParams, "params"), async (request, response, next) => {
    try {
      response.json({
        data: await topicService.getTopic(request.auth.organization.id, request.params.id),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/ideas",
    validate(topicParams, "params"),
    validate(createIdeaBody),
    async (request, response, next) => {
      try {
        const idea = await topicService.addIdea(
          request.auth.organization.id, request.params.id, request.body,
        );
        response.status(201).json({ data: idea });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/analyze",
    validate(topicParams, "params"),
    validate(analyzeBody),
    async (request, response, next) => {
      try {
        const analysis = await analysisService.analyzeTopic({
          organizationId: request.auth.organization.id,
          topicId: request.params.id,
          regenerate: request.body.regenerate,
        });
        response.json({ data: analysis });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

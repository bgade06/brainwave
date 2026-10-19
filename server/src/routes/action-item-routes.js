import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { validate } from "../middleware/validate.js";

const objectId = z.string().refine((value) => mongoose.isObjectIdOrHexString(value), {
  message: "Must be a valid object id",
});
const topicParams = z.object({ topicId: objectId });
const itemParams = z.object({ id: objectId });
const priority = z.enum(["low", "medium", "high"]);
const rationale = z.string().trim().max(2_000);
const createBody = z.object({
  text: z.string().trim().min(1).max(5_000),
  priority: priority.optional(),
  rationale: rationale.optional(),
}).strict();
const patchBody = z.object({
  priority: priority.optional(),
  rationale: rationale.optional(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
  reopen: z.boolean().optional().default(false),
}).strict().refine(
  (body) => body.priority !== undefined ||
    body.rationale !== undefined ||
    body.status !== undefined,
  { message: "At least one update field is required" },
);

export function createActionItemRouter({ actionItemService }) {
  const router = Router();

  router.get(
    "/topics/:topicId/action-items",
    validate(topicParams, "params"),
    async (request, response, next) => {
      try {
        response.json({ data: await actionItemService.list(
          request.auth.organization.id, request.params.topicId,
        ) });
      } catch (error) { next(error); }
    },
  );
  router.post(
    "/topics/:topicId/action-items",
    validate(topicParams, "params"),
    validate(createBody),
    async (request, response, next) => {
      try {
        response.status(201).json({ data: await actionItemService.createManual(
          request.auth.organization.id, request.params.topicId, request.body,
        ) });
      } catch (error) { next(error); }
    },
  );
  router.patch(
    "/action-items/:id",
    validate(itemParams, "params"),
    validate(patchBody),
    async (request, response, next) => {
      try {
        response.json({ data: await actionItemService.patch(
          request.auth.organization.id, request.params.id, request.body,
        ) });
      } catch (error) { next(error); }
    },
  );
  router.post(
    "/action-items/:id/claim",
    validate(itemParams, "params"),
    async (request, response, next) => {
      try {
        response.json({ data: await actionItemService.claim(
          request.auth.organization.id, request.params.id, request.auth.user.id,
        ) });
      } catch (error) { next(error); }
    },
  );
  router.delete(
    "/action-items/:id/claim",
    validate(itemParams, "params"),
    async (request, response, next) => {
      try {
        response.json({ data: await actionItemService.unclaim(
          request.auth.organization.id, request.params.id, request.auth.user.id,
        ) });
      } catch (error) { next(error); }
    },
  );
  return router;
}

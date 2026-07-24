import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { AppError } from "../errors/app-error.js";

const NONCE_COOKIE = "brainwave_jira_nonce";
const cookies = (header = "") => Object.fromEntries(
  header.split(";").filter(Boolean).map((part) => {
    const [name, ...value] = part.trim().split("=");
    return [name, decodeURIComponent(value.join("="))];
  }),
);
const nonceCookie = (token, secure) => [
  `${NONCE_COOKIE}=${encodeURIComponent(token)}`,
  "Path=/integrations/jira/callback",
  "HttpOnly",
  "SameSite=Lax",
  "Max-Age=600",
  ...(secure ? ["Secure"] : []),
].join("; ");
const clearNonce = (secure) => `${nonceCookie("", secure)}; Max-Age=0`;
const objectId = z.string().refine(mongoose.isObjectIdOrHexString, {
  message: "Must be a valid object id",
});
const itemParams = z.object({ id: objectId });
const createIssueBody = z.object({
  projectKey: z.string().trim().min(1).max(50),
  issueTypeId: z.string().trim().min(1).max(100).optional(),
}).strict();

export function createJiraRouter({ jiraService, authenticate, csrf, secureCookies }) {
  const router = Router();
  const ownerOnly = (request, _response, next) => request.auth.role === "owner"
    ? next()
    : next(new AppError(403, "ORGANIZATION_OWNER_REQUIRED", "Organization owner access required"));
  router.get("/integrations/jira/status", authenticate, async (request, response, next) => {
    try { response.json({ data: await jiraService.status(request.auth.organization.id) }); }
    catch (error) { next(error); }
  });
  const connect = async (request, response, next) => {
    try {
      const result = await jiraService.connect(
        request.auth.organization.id, request.auth.user.id, request.query.cloudId,
      );
      response.setHeader("set-cookie", nonceCookie(result.browserNonce, secureCookies));
      response.redirect(302, result.url);
    } catch (error) { next(error); }
  };
  router.get("/integrations/jira/connect", authenticate, ownerOnly, connect);
  router.get("/integrations/jira/start", authenticate, ownerOnly, connect);
  router.get("/integrations/jira/callback", authenticate, ownerOnly, async (request, response, next) => {
    try {
      if (!request.query.state || !request.query.code) {
        throw new AppError(400, "JIRA_OAUTH_CALLBACK_INVALID", "OAuth code and state are required");
      }
      const result = await jiraService.callback({
        ...request.query,
        browserNonce: cookies(request.headers.cookie)[NONCE_COOKIE],
        organizationId: request.auth.organization.id,
        userId: request.auth.user.id,
      });
      response.setHeader("set-cookie", clearNonce(secureCookies));
      response.redirect(302, result.redirectUrl);
    } catch (error) { next(error); }
  });
  router.delete("/integrations/jira", authenticate, ownerOnly, csrf, async (request, response, next) => {
    try { response.json({ data: await jiraService.disconnect(request.auth.organization.id) }); }
    catch (error) { next(error); }
  });
  router.get("/integrations/jira/projects", authenticate, async (request, response, next) => {
    try { response.json({ data: await jiraService.projects(request.auth.organization.id) }); }
    catch (error) { next(error); }
  });
  router.post(
    "/action-items/:id/jira",
    authenticate, csrf, validate(itemParams, "params"), validate(createIssueBody),
    async (request, response, next) => {
      try {
        response.status(201).json({ data: await jiraService.createIssue(
          request.auth.organization.id, request.params.id, request.body,
        ) });
      } catch (error) { next(error); }
    },
  );
  router.post(
    "/action-items/:id/jira/sync",
    authenticate, csrf, validate(itemParams, "params"),
    async (request, response, next) => {
      try {
        response.json({ data: await jiraService.pushStatus(
          request.auth.organization.id, request.params.id,
        ) });
      } catch (error) { next(error); }
    },
  );
  return router;
}

export function createJiraWebhookRouter({ jiraService }) {
  const router = Router();
  router.post(
    "/:connectionId",
    validate(z.object({ connectionId: objectId }), "params"),
    async (request, response, next) => {
    try {
      response.status(202).json({ data: await jiraService.webhook(
        request.params.connectionId, request.body, request.headers,
      ) });
    } catch (error) { next(error); }
    },
  );
  return router;
}

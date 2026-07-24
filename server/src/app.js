import express from "express";
import { randomUUID } from "node:crypto";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { createTopicRouter } from "./routes/topic-routes.js";
import {
  mongooseActionItemRepository,
  mongooseAnalysisRepository,
  mongooseIdeaRepository,
  mongooseTopicRepository,
} from "./repositories/mongoose-repositories.js";
import {
  createAnalysisService,
  UnconfiguredAnalysisService,
} from "./services/analysis-service.js";
import { BedrockAnalysisProvider } from "./providers/bedrock-analysis-provider.js";
import { createTopicService } from "./services/topic-service.js";
import { createOAuthAdapters } from "./auth/oauth-adapters.js";
import { createTokenCipher } from "./auth/crypto.js";
import { mongooseAuthRepository } from "./repositories/auth-repository.js";
import { createAuthService } from "./services/auth-service.js";
import {
  createAuthenticationMiddleware,
  requireCsrf,
} from "./middleware/auth.js";
import { createAuthRouter } from "./routes/auth-routes.js";
import { createActionItemService } from "./services/action-item-service.js";
import { createActionItemRouter } from "./routes/action-item-routes.js";
import { JiraCloudProvider } from "./providers/jira-provider.js";
import { mongooseJiraRepository } from "./repositories/jira-repository.js";
import { createJiraService } from "./services/jira-service.js";
import { createJiraRouter, createJiraWebhookRouter } from "./routes/jira-routes.js";

export function createApp(overrides = {}) {
  const app = express();
  const config = overrides.config ?? { NODE_ENV: process.env.NODE_ENV ?? "development" };
  if (config.NODE_ENV === "production" && (config.AUTH_BYPASS || overrides.authBypass)) {
    throw new Error("AUTH_BYPASS is forbidden in production");
  }
  const bypassEnabled = overrides.authBypass ??
    config.AUTH_BYPASS ??
    config.NODE_ENV === "test";
  const bypassContext = bypassEnabled ? (overrides.bypassContext ?? {
    user: { id: "507f1f77bcf86cd799439001", email: "dev@brainwave.local", name: "Developer" },
    organization: {
      id: "507f1f77bcf86cd799439002", name: "Development workspace", slug: "development",
    },
    role: "owner",
    csrfToken: "development-csrf-token",
  }) : undefined;
  const tokenCipher = config.OAUTH_TOKEN_ENCRYPTION_KEY
    ? createTokenCipher(config.OAUTH_TOKEN_ENCRYPTION_KEY)
    : undefined;
  let authService = overrides.authService;
  if (!authService && config.OAUTH_TOKEN_ENCRYPTION_KEY) {
    authService = createAuthService({
      repository: overrides.authRepository ?? mongooseAuthRepository,
      adapters: overrides.oauthAdapters ?? createOAuthAdapters(config),
      cipher: tokenCipher,
      apiBaseUrl: config.API_BASE_URL,
      clientUrl: config.CLIENT_URL,
      sessionTtlMs: config.SESSION_TTL_MS,
    });
  }
  const authenticate = overrides.authMiddleware ?? createAuthenticationMiddleware({
    authService,
    bypassContext,
  });
  const topicService = overrides.topicService ?? createTopicService({
    topicRepository: mongooseTopicRepository,
    ideaRepository: mongooseIdeaRepository,
    analysisRepository: mongooseAnalysisRepository,
    actionItemRepository: mongooseActionItemRepository,
  });
  const actionItemService = overrides.actionItemService ?? createActionItemService({
    topicRepository: mongooseTopicRepository,
    actionItemRepository: mongooseActionItemRepository,
  });
  let jiraService = overrides.jiraService;
  if (!jiraService && config.JIRA_CLIENT_ID && tokenCipher) {
    jiraService = createJiraService({
      repository: overrides.jiraRepository ?? mongooseJiraRepository,
      provider: overrides.jiraProvider ?? new JiraCloudProvider({
        clientId: config.JIRA_CLIENT_ID,
        clientSecret: config.JIRA_CLIENT_SECRET,
        timeoutMs: config.JIRA_TIMEOUT_MS,
      }),
      cipher: tokenCipher,
      apiBaseUrl: config.API_BASE_URL,
      clientUrl: config.CLIENT_URL,
      preferredCloudId: config.JIRA_CLOUD_ID,
    });
  }
  let analysisService = overrides.analysisService;
  if (!analysisService && config.AI_PROVIDER === "bedrock") {
    const provider = overrides.analysisProvider ?? new BedrockAnalysisProvider({
      region: config.AWS_REGION,
      modelId: config.BEDROCK_MODEL_ID,
    });
    analysisService = createAnalysisService({
      topicRepository: mongooseTopicRepository,
      ideaRepository: mongooseIdeaRepository,
      analysisRepository: mongooseAnalysisRepository,
      actionItemRepository: mongooseActionItemRepository,
      provider,
      timeoutMs: config.AI_TIMEOUT_MS,
    });
  }
  analysisService ??= new UnconfiguredAnalysisService();

  app.disable("x-powered-by");
  app.use((request, response, next) => {
    request.requestId = request.headers["x-request-id"] || randomUUID();
    response.setHeader("x-request-id", request.requestId);
    next();
  });
  if (jiraService) {
    app.use(
      "/webhooks/jira",
      express.raw({ type: "application/json", limit: "256kb" }),
      createJiraWebhookRouter({ jiraService }),
    );
  }
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_request, response) => {
    response.json({ data: { status: "ok" } });
  });
  app.get("/ready", async (_request, response) => {
    const ready = await (overrides.readinessCheck ?? (() => true))();
    response.status(ready ? 200 : 503).json({
      data: { status: ready ? "ready" : "not_ready" },
    });
  });
  if (authService || bypassContext) {
    app.use("/auth", createAuthRouter({
      authService,
      authenticate,
      csrf: requireCsrf,
      secureCookies: config.NODE_ENV === "production",
      bypassContext,
      sessionTtlMs: config.SESSION_TTL_MS,
    }));
  }
  if (jiraService) {
    app.use(createJiraRouter({
      jiraService,
      authenticate,
      csrf: requireCsrf,
      secureCookies: config.NODE_ENV === "production",
    }));
  }
  app.use("/topics", authenticate, requireCsrf, createTopicRouter({
    topicService, analysisService,
  }));
  app.use(authenticate, requireCsrf, createActionItemRouter({ actionItemService }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

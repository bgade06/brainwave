import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  MONGODB_URI: z.string().min(1),
  AI_PROVIDER: z.enum(["unconfigured", "bedrock"]).default("unconfigured"),
  AWS_REGION: z.string().min(1).default("us-east-1"),
  BEDROCK_MODEL_ID: z.string().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  API_BASE_URL: z.string().url().default("http://localhost:3000"),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  OAUTH_TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
  SESSION_TTL_MS: z.coerce.number().int().positive().default(2_592_000_000),
  AUTH_BYPASS: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  JIRA_CLIENT_ID: z.string().min(1).optional(),
  JIRA_CLIENT_SECRET: z.string().min(1).optional(),
  JIRA_CLOUD_ID: z.string().min(1).optional(),
  JIRA_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(10_000),
});

export function loadEnv(source = process.env) {
  // Blank entries copied from .env.example mean "unset", not an invalid value.
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  const config = envSchema.parse(present);
  if (config.NODE_ENV === "production" && config.AUTH_BYPASS) {
    throw new Error("AUTH_BYPASS is forbidden in production");
  }
  if (!config.AUTH_BYPASS && !config.OAUTH_TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      "OAUTH_TOKEN_ENCRYPTION_KEY is required unless development authentication bypass is enabled",
    );
  }
  for (const provider of ["GITHUB", "GOOGLE"]) {
    const hasId = Boolean(config[`${provider}_CLIENT_ID`]);
    const hasSecret = Boolean(config[`${provider}_CLIENT_SECRET`]);
    if (hasId !== hasSecret) {
      throw new Error(
        `${provider}_CLIENT_ID and ${provider}_CLIENT_SECRET must be configured together`,
      );
    }
  }
  if (Boolean(config.JIRA_CLIENT_ID) !== Boolean(config.JIRA_CLIENT_SECRET)) {
    throw new Error("JIRA_CLIENT_ID and JIRA_CLIENT_SECRET must be configured together");
  }
  return config;
}

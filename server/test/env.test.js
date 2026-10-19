import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

const base = { MONGODB_URI: "mongodb://127.0.0.1:27017/test", AUTH_BYPASS: "true" };

describe("loadEnv", () => {
  it("treats blank values from .env.example as unset", () => {
    const config = loadEnv({ ...base, BEDROCK_MODEL_ID: "", GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "" });
    expect(config.BEDROCK_MODEL_ID).toBeUndefined();
    expect(config.GITHUB_CLIENT_ID).toBeUndefined();
  });

  it("still requires paired OAuth credentials", () => {
    expect(() => loadEnv({ ...base, GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "" }))
      .toThrow("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be configured together");
  });
});

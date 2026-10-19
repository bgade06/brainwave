import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTokenCipher } from "../src/auth/crypto.js";
import { createApp } from "../src/app.js";
import { createAuthService } from "../src/services/auth-service.js";
import { createTopicService } from "../src/services/topic-service.js";

const orgA = "507f1f77bcf86cd799439002";
const orgB = "507f1f77bcf86cd799439003";
const topicId = "507f1f77bcf86cd799439011";

function authHarness() {
  const states = [];
  const sessions = [];
  let personal;
  const repository = {
    async createOAuthState(value) { states.push(value); },
    async consumeOAuthState(hash, browserNonceHash) {
      const index = states.findIndex((item) =>
        item.stateHash === hash && item.browserNonceHash === browserNonceHash);
      return index === -1 ? null : states.splice(index, 1)[0];
    },
    async findUserByIdentity() { return null; },
    async createUserWithPersonalOrganization({ profile, identity }) {
      personal = {
        profile,
        identity,
        user: { _id: "user-1", ...profile },
        organization: { _id: orgA, name: "Ada's workspace", slug: "personal-1" },
        role: "owner",
      };
      return personal;
    },
    async createSession(value) { sessions.push(value); },
    async findSession() {
      return sessions[0] ? {
        ...sessions[0],
        userId: "user-1",
        activeOrganizationId: orgA,
      } : null;
    },
    async findUser() { return personal?.user ?? null; },
    async findMembership() { return personal ? { role: "owner" } : null; },
    async findOrganization() { return personal?.organization ?? null; },
  };
  const adapter = {
    name: "github",
    supportsPkce: true,
    authorizationUrl: vi.fn(({ redirectUri, state, codeChallenge }) =>
      `https://provider.test/auth?redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}&code_challenge=${codeChallenge}`),
    exchangeCode: vi.fn(async () => ({
      access_token: "provider-access", refresh_token: "provider-refresh",
    })),
    fetchProfile: vi.fn(async () => ({
      providerUserId: "42",
      email: "ada@example.com",
      name: "Ada",
    })),
  };
  const key = Buffer.alloc(32, 7).toString("base64");
  const service = createAuthService({
    repository,
    adapters: { github: adapter },
    cipher: createTokenCipher(key),
    apiBaseUrl: "https://api.example.com",
    clientUrl: "https://app.example.com",
  });
  return { service, repository, adapter, states, sessions, get personal() { return personal; } };
}

describe("authentication and tenant boundaries", () => {
  it("uses an exact callback, one-time state, PKCE, encrypted tokens, and personal owner org", async () => {
    const test = authHarness();
    const started = await test.service.start("github");
    const url = new URL(started.authorizationUrl);
    expect(url.searchParams.get("redirect_uri"))
      .toBe("https://api.example.com/auth/github/callback");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]+$/);

    const result = await test.service.callback("github", {
      code: "oauth-code",
      state: url.searchParams.get("state"),
      browserNonce: started.browserNonce,
    });
    expect(test.adapter.exchangeCode).toHaveBeenCalledWith(expect.objectContaining({
      code: "oauth-code",
      redirectUri: "https://api.example.com/auth/github/callback",
      codeVerifier: expect.any(String),
    }));
    expect(test.personal.role).toBe("owner");
    expect(test.personal.identity.accessToken).not.toContain("provider-access");
    expect(test.sessions[0]).toMatchObject({
      activeOrganizationId: orgA,
      userId: "user-1",
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result.redirectUrl).toBe("https://app.example.com");
    await expect(test.service.resolveSession("session-token")).resolves.toMatchObject({
      enabledProviders: ["github"],
      user: { id: "user-1" },
      organization: { id: orgA },
    });
    await expect(test.service.callback("github", {
      code: "replay",
      state: url.searchParams.get("state"),
      browserNonce: started.browserNonce,
    })).rejects.toMatchObject({ status: 400, code: "OAUTH_STATE_INVALID" });
  });

  it("rejects missing authentication and CSRF before mutations", async () => {
    const authService = { resolveSession: vi.fn(async () => null) };
    const app = createApp({
      config: { NODE_ENV: "test" },
      authBypass: false,
      authService,
      topicService: {},
    });
    const unauthenticated = await request(app).get("/topics");
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe("AUTHENTICATION_REQUIRED");

    authService.resolveSession.mockResolvedValue({
      user: { id: "user-1" },
      organization: { id: orgA },
      role: "owner",
      csrfToken: "csrf-good",
    });
    const missingCsrf = await request(app)
      .post("/topics")
      .set("cookie", "brainwave_session=opaque")
      .send({ title: "Blocked" });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("returns the session envelope and invalidates logout with an HttpOnly cookie", async () => {
    const context = {
      user: { id: "user-1", email: "ada@example.com", name: "Ada" },
      organization: { id: orgA, name: "Ada's workspace", slug: "personal-1" },
      role: "owner",
      csrfToken: "csrf-good",
      sessionToken: "opaque",
    };
    const authService = {
      resolveSession: vi.fn(async () => context),
      logout: vi.fn(async () => {}),
    };
    const app = createApp({
      config: { NODE_ENV: "test" },
      authBypass: false,
      authService,
      topicService: {},
    });
    const session = await request(app)
      .get("/auth/session")
      .set("cookie", "brainwave_session=opaque");
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({ data: {
      authenticated: true,
      user: context.user,
      organization: context.organization,
      role: "owner",
      csrfToken: "csrf-good",
    } });

    const logout = await request(app)
      .post("/auth/logout")
      .set("cookie", "brainwave_session=opaque")
      .set("x-csrf-token", "csrf-good");
    expect(logout.status).toBe(200);
    expect(authService.logout).toHaveBeenCalledWith("opaque");
    expect(logout.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(logout.headers["set-cookie"][0]).toContain("SameSite=Lax");
    expect(logout.headers["set-cookie"][0]).toContain("Max-Age=0");
  });

  it("returns an anonymous session envelope without leaking an auth error", async () => {
    const authService = {
      resolveSession: vi.fn(async () => null),
    };
    const app = createApp({
      config: { NODE_ENV: "test" },
      authBypass: false,
      authService,
      topicService: {},
    });

    const response = await request(app).get("/auth/session");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { authenticated: false } });
  });

  it("returns 404 for a topic owned by another organization", async () => {
    const stored = [{ _id: topicId, organizationId: orgB, title: "Secret" }];
    const service = createTopicService({
      topicRepository: {
        async findById(organizationId, id) {
          return stored.find((topic) =>
            topic.organizationId === organizationId && topic._id === id) ?? null;
        },
      },
      ideaRepository: {},
    });
    await expect(service.getTopic(orgA, topicId)).rejects.toMatchObject({
      status: 404,
      code: "TOPIC_NOT_FOUND",
    });
  });

  it("refuses authentication bypass in production", () => {
    expect(() => createApp({
      config: { NODE_ENV: "production", AUTH_BYPASS: true },
    })).toThrow("AUTH_BYPASS is forbidden in production");
  });
});

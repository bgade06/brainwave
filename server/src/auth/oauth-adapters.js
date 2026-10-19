import { AppError } from "../errors/app-error.js";

async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new AppError(
        502,
        "OAUTH_PROVIDER_ERROR",
        "OAuth provider request failed",
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new AppError(
        504,
        "OAUTH_PROVIDER_TIMEOUT",
        "OAuth provider request timed out",
      );
    }
    throw new AppError(
      502,
      "OAUTH_PROVIDER_ERROR",
      "OAuth provider request failed",
    );
  }
}

class OAuthAdapter {
  constructor({ name, clientId, clientSecret, authorizeUrl, tokenUrl, scopes }) {
    Object.assign(this, {
      name, clientId, clientSecret, authorizeUrl, tokenUrl, scopes, supportsPkce: true,
    });
  }

  authorizationUrl({ redirectUri, state, codeChallenge }) {
    const query = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: this.scopes.join(" "),
      state,
    });
    if (codeChallenge) {
      query.set("code_challenge", codeChallenge);
      query.set("code_challenge_method", "S256");
    }
    return `${this.authorizeUrl}?${query}`;
  }

  async exchangeCode({ code, redirectUri, codeVerifier }) {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    if (codeVerifier) body.set("code_verifier", codeVerifier);
    const tokens = await requestJson(this.tokenUrl, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokens?.access_token || typeof tokens.access_token !== "string") {
      throw new AppError(
        502,
        "OAUTH_TOKEN_INVALID",
        "OAuth provider returned an invalid token response",
      );
    }
    return tokens;
  }
}

class GitHubAdapter extends OAuthAdapter {
  constructor(config) {
    super({
      name: "github",
      clientId: config.GITHUB_CLIENT_ID,
      clientSecret: config.GITHUB_CLIENT_SECRET,
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["read:user", "user:email"],
    });
  }

  async fetchProfile(tokens) {
    const headers = {
      authorization: `Bearer ${tokens.access_token}`,
      accept: "application/vnd.github+json",
      "user-agent": "brainwave",
    };
    const [profile, emails] = await Promise.all([
      requestJson("https://api.github.com/user", { headers }),
      requestJson("https://api.github.com/user/emails", { headers }),
    ]);
    const email = profile.email ??
      emails.find((item) => item.primary && item.verified)?.email ??
      emails.find((item) => item.verified)?.email;
    if (!email) throw new AppError(422, "OAUTH_EMAIL_REQUIRED", "A verified email is required");
    return {
      providerUserId: String(profile.id),
      email,
      name: profile.name || profile.login,
      avatarUrl: profile.avatar_url,
    };
  }
}

class GoogleAdapter extends OAuthAdapter {
  constructor(config) {
    super({
      name: "google",
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["openid", "email", "profile"],
    });
  }

  async fetchProfile(tokens) {
    const profile = await requestJson("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profile.email || profile.email_verified === false) {
      throw new AppError(422, "OAUTH_EMAIL_REQUIRED", "A verified email is required");
    }
    return {
      providerUserId: String(profile.sub),
      email: profile.email,
      name: profile.name || profile.email,
      avatarUrl: profile.picture,
    };
  }
}

export function createOAuthAdapters(config) {
  const adapters = {};
  if (config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET) {
    adapters.github = new GitHubAdapter(config);
  }
  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    adapters.google = new GoogleAdapter(config);
  }
  return adapters;
}

import { AppError } from "../errors/app-error.js";

async function parseResponse(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { message: text }; }
}

export class JiraCloudProvider {
  constructor({ clientId, clientSecret, timeoutMs = 10_000, fetchImpl = fetch }) {
    Object.assign(this, { clientId, clientSecret, timeoutMs, fetchImpl });
  }

  async request(url, options = {}, attempts = 2) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let response;
      try {
        response = await this.fetchImpl(url, {
          ...options,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (attempt + 1 < attempts) continue;
        throw new AppError(502, "JIRA_UNAVAILABLE", "Jira request failed");
      }
      const body = await parseResponse(response);
      if (response.ok) return body;
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) continue;
      throw new AppError(
        response.status === 401 ? 401 : 502,
        response.status === 401 ? "JIRA_REAUTH_REQUIRED" : "JIRA_PROVIDER_ERROR",
        "Jira request failed",
      );
    }
    throw new AppError(502, "JIRA_UNAVAILABLE", "Jira request failed");
  }

  authorizationUrl({ redirectUri, state }) {
    return `https://auth.atlassian.com/authorize?${new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: this.clientId,
      scope: "offline_access read:jira-work write:jira-work read:jira-user manage:jira-webhook",
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      prompt: "consent",
    })}`;
  }

  exchangeCode({ code, redirectUri }) {
    return this.request("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    }, 1);
  }

  refresh(refreshToken) {
    return this.request("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
    }, 1);
  }

  accessibleResources(accessToken) {
    return this.request("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    });
  }

  listProjects({ cloudId, accessToken }) {
    return this.request(
      `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3/project/search`,
      { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } },
    );
  }

  createIssue({ cloudId, accessToken, fields, properties = [] }) {
    return this.request(
      `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3/issue`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ fields, properties }),
      },
      1,
    );
  }

  registerWebhook({ cloudId, accessToken, url, secret }) {
    return this.request(
      `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/webhooks/1.0/webhook`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Brainwave status sync",
          url,
          events: ["jira:issue_updated"],
          excludeBody: false,
          secret,
        }),
      },
      1,
    );
  }

  unregisterWebhook({ cloudId, accessToken, webhookId }) {
    return this.request(
      `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}` +
        `/rest/webhooks/1.0/webhook/${encodeURIComponent(webhookId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      },
      1,
    );
  }

  async findIssueByCorrelation({ cloudId, accessToken, projectKey, correlationLabel }) {
    const query = new URLSearchParams({
      jql: `project = "${projectKey.replaceAll("\"", "\\\"")}" AND labels = "${correlationLabel}"`,
      fields: "key",
      maxResults: "1",
    });
    const result = await this.request(
      `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}` +
        `/rest/api/3/search/jql?${query}`,
      { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } },
    );
    return result.issues?.[0] ?? null;
  }

  async transitionIssue({ cloudId, accessToken, issueKey, status }) {
    const base = `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}` +
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`;
    const result = await this.request(base, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    });
    const desiredCategory = status === "done" ? "done"
      : status === "in_progress" ? "indeterminate" : "new";
    const transition = result.transitions?.find((item) =>
      item.to?.statusCategory?.key === desiredCategory);
    if (!transition) {
      throw new AppError(409, "JIRA_TRANSITION_UNAVAILABLE", "No Jira transition matches status");
    }
    await this.request(base, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ transition: { id: transition.id } }),
    }, 1);
  }
}

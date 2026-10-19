import { AppError } from "../errors/app-error.js";
import { hashToken, pkceChallenge, randomToken } from "../auth/crypto.js";

const STATE_TTL_MS = 10 * 60 * 1000;

function publicContext({ user, organization, role, csrfToken }, enabledProviders) {
  return {
    enabledProviders,
    user: {
      id: String(user._id ?? user.id),
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    organization: {
      id: String(organization._id ?? organization.id),
      name: organization.name,
      slug: organization.slug,
    },
    role,
    csrfToken,
  };
}

export function createAuthService({
  repository,
  adapters,
  cipher,
  apiBaseUrl,
  clientUrl,
  sessionTtlMs = 30 * 24 * 60 * 60 * 1000,
}) {
  const baseUrl = apiBaseUrl.replace(/\/+$/, "");
  const enabledProviders = Object.keys(adapters);
  const redirectUri = (provider) => `${baseUrl}/auth/${provider}/callback`;
  const adapterFor = (provider) => {
    const adapter = adapters[provider];
    if (!adapter) throw new AppError(404, "OAUTH_PROVIDER_NOT_FOUND", "OAuth provider not configured");
    return adapter;
  };

  return {
    enabledProviders,
    async start(provider) {
      const adapter = adapterFor(provider);
      const state = randomToken();
      const browserNonce = randomToken();
      const codeVerifier = adapter.supportsPkce ? randomToken(48) : undefined;
      await repository.createOAuthState({
        stateHash: hashToken(state),
        browserNonceHash: hashToken(browserNonce),
        provider,
        codeVerifier,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      });
      return {
        authorizationUrl: adapter.authorizationUrl({
          redirectUri: redirectUri(provider),
          state,
          codeChallenge: codeVerifier ? pkceChallenge(codeVerifier) : undefined,
        }),
        browserNonce,
      };
    },
    async callback(provider, { state, code, browserNonce }) {
      const adapter = adapterFor(provider);
      const saved = await repository.consumeOAuthState(
        hashToken(state ?? ""),
        hashToken(browserNonce ?? ""),
      );
      if (!saved || saved.provider !== provider) {
        throw new AppError(400, "OAUTH_STATE_INVALID", "OAuth state is invalid or expired");
      }
      const tokens = await adapter.exchangeCode({
        code,
        redirectUri: redirectUri(provider),
        codeVerifier: saved.codeVerifier,
      });
      const profile = await adapter.fetchProfile(tokens);
      const identity = {
        provider,
        providerUserId: profile.providerUserId,
        accessToken: cipher.encrypt(tokens.access_token),
        refreshToken: cipher.encrypt(tokens.refresh_token),
      };
      let user = await repository.findUserByIdentity(provider, profile.providerUserId);
      let membership;
      let organization;
      if (!user) {
        ({ user, organization, role: membership } =
          await repository.createUserWithPersonalOrganization({ profile, identity }));
      } else {
        await repository.updateIdentity(user._id ?? user.id, provider, identity);
        membership = await repository.firstMembership(user._id ?? user.id);
        if (!membership) throw new AppError(403, "ORGANIZATION_ACCESS_REQUIRED", "No organization access");
        organization = await repository.findOrganization(membership.organizationId);
        membership = membership.role;
      }
      const sessionToken = randomToken();
      const csrfToken = randomToken();
      await repository.createSession({
        tokenHash: hashToken(sessionToken),
        csrfToken,
        userId: user._id ?? user.id,
        activeOrganizationId: organization._id ?? organization.id,
        expiresAt: new Date(Date.now() + sessionTtlMs),
      });
      return { sessionToken, redirectUrl: clientUrl };
    },
    async resolveSession(sessionToken) {
      if (!sessionToken) return null;
      const session = await repository.findSession(hashToken(sessionToken));
      if (!session) return null;
      const [user, membership, organization] = await Promise.all([
        repository.findUser(session.userId),
        repository.findMembership(session.userId, session.activeOrganizationId),
        repository.findOrganization(session.activeOrganizationId),
      ]);
      if (!user || !membership || !organization) return null;
      return {
        ...publicContext(
          { user, organization, role: membership.role, csrfToken: session.csrfToken },
          enabledProviders,
        ),
        sessionToken,
      };
    },
    async logout(sessionToken) {
      if (sessionToken) await repository.deleteSession(hashToken(sessionToken));
    },
  };
}

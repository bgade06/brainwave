import { AppError } from "../errors/app-error.js";
import { tokensEqual } from "../auth/crypto.js";

export const SESSION_COOKIE = "brainwave_session";
export const OAUTH_NONCE_COOKIE = "brainwave_oauth_nonce";

function cookies(header = "") {
  return Object.fromEntries(header.split(";").filter(Boolean).map((part) => {
    const [name, ...value] = part.trim().split("=");
    return [name, decodeURIComponent(value.join("="))];
  }));
}

export const sessionCookie = (token, secure, maxAgeMs) => [
  `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
  "Path=/",
  "HttpOnly",
  "SameSite=Lax",
  ...(maxAgeMs ? [`Max-Age=${Math.floor(maxAgeMs / 1000)}`] : []),
  ...(secure ? ["Secure"] : []),
].join("; ");

export const clearSessionCookie = (secure) =>
  `${sessionCookie("", secure)}; Max-Age=0`;

export const oauthNonceCookie = (token, secure) => [
  `${OAUTH_NONCE_COOKIE}=${encodeURIComponent(token)}`,
  "Path=/auth",
  "HttpOnly",
  "SameSite=Lax",
  "Max-Age=600",
  ...(secure ? ["Secure"] : []),
].join("; ");

export const clearOAuthNonceCookie = (secure) =>
  `${oauthNonceCookie("", secure)}; Max-Age=0`;

export function getSessionToken(request) {
  return cookies(request.headers.cookie)[SESSION_COOKIE];
}

export function getOAuthNonce(request) {
  return cookies(request.headers.cookie)[OAUTH_NONCE_COOKIE];
}

export function createAuthenticationMiddleware({ authService, bypassContext }) {
  return async (request, _response, next) => {
    try {
      const context = bypassContext ?? await authService?.resolveSession(getSessionToken(request));
      if (!context) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
      request.auth = context;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireCsrf(request, _response, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  if (!tokensEqual(request.headers["x-csrf-token"], request.auth?.csrfToken)) {
    return next(new AppError(403, "CSRF_TOKEN_INVALID", "A valid CSRF token is required"));
  }
  next();
}

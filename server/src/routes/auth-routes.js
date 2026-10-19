import { Router } from "express";
import {
  clearSessionCookie,
  clearOAuthNonceCookie,
  getOAuthNonce,
  getSessionToken,
  oauthNonceCookie,
  sessionCookie,
} from "../middleware/auth.js";
import { AppError } from "../errors/app-error.js";

export function createAuthRouter({
  authService,
  authenticate,
  csrf,
  secureCookies,
  bypassContext,
  sessionTtlMs,
}) {
  const router = Router();

  router.get("/session", async (request, response, next) => {
    try {
      const resolved = bypassContext ??
        await authService?.resolveSession(getSessionToken(request));
      if (!resolved) {
        return response.json({
          data: {
            authenticated: false,
            enabledProviders: authService?.enabledProviders ?? [],
          },
        });
      }
      const { sessionToken: _, ...context } = resolved;
      return response.json({
        data: {
          authenticated: true,
          enabledProviders: authService?.enabledProviders ?? [],
          ...context,
        },
      });
    } catch (error) {
      return next(error);
    }
  });
  router.get("/:provider/start", async (request, response, next) => {
    try {
      if (!authService) {
        throw new AppError(
          503,
          "OAUTH_NOT_CONFIGURED",
          "OAuth is not configured for this environment",
        );
      }
      const result = await authService.start(request.params.provider);
      response.setHeader(
        "set-cookie",
        oauthNonceCookie(result.browserNonce, secureCookies),
      );
      response.redirect(302, result.authorizationUrl);
    } catch (error) { next(error); }
  });
  router.get("/:provider/callback", async (request, response, next) => {
    try {
      if (!authService) {
        throw new AppError(
          503,
          "OAUTH_NOT_CONFIGURED",
          "OAuth is not configured for this environment",
        );
      }
      if (!request.query.code || !request.query.state) {
        throw new AppError(400, "OAUTH_CALLBACK_INVALID", "OAuth code and state are required");
      }
      const result = await authService.callback(request.params.provider, {
        ...request.query,
        browserNonce: getOAuthNonce(request),
      });
      response.setHeader("set-cookie", [
        sessionCookie(result.sessionToken, secureCookies, sessionTtlMs),
        clearOAuthNonceCookie(secureCookies),
      ]);
      response.redirect(302, result.redirectUrl);
    } catch (error) { next(error); }
  });
  router.post("/logout", authenticate, csrf, async (request, response, next) => {
    try {
      await authService.logout(getSessionToken(request));
      response.setHeader("set-cookie", clearSessionCookie(secureCookies));
      response.json({ data: { loggedOut: true } });
    } catch (error) { next(error); }
  });
  return router;
}

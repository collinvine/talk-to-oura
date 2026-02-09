import type { Request, Response, Router } from "express";
import crypto from "crypto";
import {
  isOAuthConfigured,
  getAuthorizationUrl,
  exchangeCodeForTokens,
} from "../oura";

function getRedirectUri(req: Request): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}/api/auth/oura/callback`;
}

export function registerAuthRoutes(router: Router): void {
  router.get("/api/auth/oura", (req: Request, res: Response) => {
    if (!isOAuthConfigured()) {
      return res.status(500).json({
        error: "OAuth not configured. OURA_CLIENT_ID and OURA_CLIENT_SECRET are required."
      });
    }

    const state = crypto.randomBytes(16).toString("hex");
    req.session.oauthState = state;

    const redirectUri = getRedirectUri(req);
    console.log("OAuth redirect URI:", redirectUri);
    const authUrl = getAuthorizationUrl(redirectUri, state);

    res.json({ authUrl, redirectUri });
  });

  router.get("/api/auth/oura/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect("/?error=access_denied");
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/?error=no_code");
    }

    if (state !== req.session.oauthState) {
      return res.redirect("/?error=invalid_state");
    }

    delete req.session.oauthState;

    const redirectUri = getRedirectUri(req);
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    if (!tokens) {
      return res.redirect("/?error=token_exchange_failed");
    }

    req.session.ouraAccessToken = tokens.accessToken;
    req.session.ouraRefreshToken = tokens.refreshToken;
    req.session.ouraTokenExpiry = Date.now() + tokens.expiresIn * 1000;

    res.redirect("/?connected=true");
  });

  router.post("/api/auth/oura/disconnect", (req: Request, res: Response) => {
    delete req.session.ouraAccessToken;
    delete req.session.ouraRefreshToken;
    delete req.session.ouraTokenExpiry;

    res.json({ success: true });
  });
}

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Centralized logo asset — transparent background version.
 * Production: served from Forge CDN (/manus-storage/...).
 * Dev fallback: local SVG when CDN is not mounted.
 */
export const LOGO_URL: string =
  (import.meta.env.VITE_LOGO_URL as string | undefined) ??
  "/manus-storage/247-logo-transparent_ef3d59e3.png";

export const LOGO_FALLBACK_URL = "/logo-placeholder.svg";

/**
 * Returns the app-owned login page path.
 * Accepts an optional returnPath so the login page can redirect back after auth.
 */
export const getLoginUrl = (returnPath?: string) => {
  if (returnPath && returnPath !== "/login") {
    return `/login?return=${encodeURIComponent(returnPath)}`;
  }
  return "/login";
};

/**
 * Build the Manus OAuth URL — kept for admin/internal use only.
 * Customer-facing login uses the app-owned /login page instead.
 * Returns null when VITE_OAUTH_PORTAL_URL is not configured (dev without OAuth).
 */
export const getManusSSOUrl = (): string | null => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL as
    | string
    | undefined;
  if (!oauthPortalUrl) return null;
  const appId = (import.meta.env.VITE_APP_ID as string | undefined) ?? "";
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  return url.toString();
};

/** True when Manus OAuth is configured in this environment. */
export const isManusSSOConfigured = (): boolean =>
  Boolean(import.meta.env.VITE_OAUTH_PORTAL_URL as string | undefined);

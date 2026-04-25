export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

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
 */
export const getManusSSOUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  return url.toString();
};

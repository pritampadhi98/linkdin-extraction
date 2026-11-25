import { NextResponse, type NextRequest } from "next/server";
import { oauthApp, saveConnection } from "@/lib/connection";

export const runtime = "nodejs";

const back = (req: NextRequest, status: string, detail?: string) => {
  const url = new URL("/onboarding", req.url);
  url.searchParams.set("linkedin", status);
  if (detail) url.searchParams.set("detail", detail.slice(0, 300));
  const res = NextResponse.redirect(url);
  res.cookies.delete("li_oauth_state");
  return res;
};

// Step 2: LinkedIn redirects here with ?code&state (or ?error&error_description).
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const error = params.get("error");
  if (error) {
    // e.g. user_cancelled_login, user_cancelled_authorize, unauthorized_scope_error
    const detail = `${error}${params.get("error_description") ? `: ${params.get("error_description")}` : ""}`;
    console.warn(`[linkedin] authorization error: ${detail}`);
    return back(req, error.startsWith("user_cancelled") ? "denied" : "linkedin-error", detail);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || state !== req.cookies.get("li_oauth_state")?.value) return back(req, "bad-state");

  const { clientId, clientSecret, redirectUri } = await oauthApp();
  if (!clientId || !clientSecret) return back(req, "missing-app");

  try {
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokenRes.ok) {
      const body = (await tokenRes.json().catch(() => ({}))) as { error?: string; error_description?: string };
      const detail = `${tokenRes.status} ${body.error ?? ""} ${body.error_description ?? ""}`.trim();
      console.warn(`[linkedin] token exchange failed: ${detail}`);
      return back(req, "token-failed", detail);
    }
    const { access_token, expires_in, scope } = (await tokenRes.json()) as { access_token: string; expires_in: number; scope?: string };

    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) return back(req, "userinfo-failed", `${meRes.status}`);
    const me = (await meRes.json()) as { sub: string; name?: string; picture?: string };

    await saveConnection({
      token: access_token,
      member: me.sub,
      name: me.name ?? "LinkedIn member",
      picture: me.picture ?? null,
      expiresAt: new Date(Date.now() + expires_in * 1000).toISOString(),
      connectedAt: new Date().toISOString(),
      scope: scope ?? undefined,
    });
    return back(req, "connected");
  } catch {
    return back(req, "network");
  }
}

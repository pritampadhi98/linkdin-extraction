import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { oauthApp } from "@/lib/connection";

export const runtime = "nodejs";

// Step 1 of "Sign In with LinkedIn" (OpenID Connect) + "Share on LinkedIn" (w_member_social).
export async function GET(req: Request) {
  const { clientId, redirectUri } = await oauthApp();
  if (!clientId) {
    return NextResponse.redirect(new URL("/onboarding?linkedin=missing-app", req.url));
  }
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  // Override with LINKEDIN_SCOPES in .env.local, e.g. "openid profile" to test sign-in alone.
  url.searchParams.set("scope", process.env.LINKEDIN_SCOPES || "openid profile w_member_social");

  const res = NextResponse.redirect(url);
  res.cookies.set("li_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}

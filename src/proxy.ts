import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

const SIGN_IN_PATH = "/auth/sign-in";

const neonAuthMiddleware = auth.middleware({
  loginUrl: SIGN_IN_PATH,
});

/**
 * Neon Auth's API proxy forwards an Origin header to the hosted auth service.
 * Some edge/proxy setups omit Origin on same-origin requests; Vercel supplies
 * x-forwarded-host / x-forwarded-proto so we can reconstruct it when missing.
 */
function withOriginFromProxy(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  if (!headers.get("origin")) {
    const host = headers.get("x-forwarded-host") ?? headers.get("host");
    const proto = headers.get("x-forwarded-proto") ?? "https";
    if (host) headers.set("origin", `${proto}://${host}`);
  }
  return headers;
}

/**
 * Neon Auth's middleware redirects unauthenticated users to `loginUrl` but
 * doesn't remember where they were going. Re-attach the original path as
 * `?next=<path>` so the sign-in form can send them back after authenticating.
 */
function withNextParam(
  response: Response,
  request: NextRequest,
): Response {
  if (response.status !== 307 && response.status !== 308 && response.status !== 302) {
    return response;
  }
  const location = response.headers.get("location");
  if (!location) return response;

  let target: URL;
  try {
    target = new URL(location, request.nextUrl);
  } catch {
    return response;
  }
  if (target.pathname !== SIGN_IN_PATH) return response;
  if (target.searchParams.has("next")) return response;

  const original = request.nextUrl.pathname + request.nextUrl.search;
  if (!original.startsWith("/") || original.startsWith(SIGN_IN_PATH)) {
    return response;
  }
  target.searchParams.set("next", original);

  const rewritten = NextResponse.redirect(target, {
    status: response.status as 302 | 307 | 308,
  });
  for (const cookie of response.headers.getSetCookie()) {
    rewritten.headers.append("set-cookie", cookie);
  }
  return rewritten;
}

export default async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/auth")) {
    return NextResponse.next({
      request: { headers: withOriginFromProxy(request) },
    });
  }
  const response = await neonAuthMiddleware(request);
  return withNextParam(response as Response, request);
}

export const config = {
  matcher: [
    "/api/auth/:path*",
    "/app/:path*",
    "/onboarding",
    "/subscribe",
  ],
};

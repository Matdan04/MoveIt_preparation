import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

// This is the ONLY thing middleware does: bounce a request with no session
// cookie to /login. It performs no role or ownership checks — it runs on the
// Edge before the request reaches an action and cannot see the resolved actor
// or the target resource. All authorization happens later, in lib/data/*.
export function middleware(req: NextRequest) {
  if (req.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals, the login route, and static files
  // (anything with a dot). A stale/forged cookie is still fully validated later
  // by requireActor against the database; presence here is only a fast gate.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|.*\\.).*)"],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ownerPasswordConfigured,
  readOwnerSession,
  readReviewToken,
} from "@/lib/session-cookie";

function isPublicPath(pathname: string) {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/r/")) return true;
  if (pathname.startsWith("/uploads/")) return true;
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/me") return true;
  if (pathname === "/api/auth/logout") return true;
  if (pathname.startsWith("/api/review/")) return true;
  return false;
}

export function proxy(request: NextRequest) {
  if (!ownerPasswordConfigured()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.headers.get("cookie");
  if (readOwnerSession(cookie) || readReviewToken(cookie)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "请先登录或使用审阅链接" },
      { status: 401 },
    );
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  if (pathname !== "/") {
    login.searchParams.set("from", pathname);
  }
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|uploads/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mov)$).*)",
  ],
};

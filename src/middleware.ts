import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (val.resetAt < now) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);

function isRateLimited(ip: string, path: string): boolean {
  let maxRequests = 0;
  if (path.startsWith("/api/flow")) {
    maxRequests = 30;
  } else if (path.startsWith("/api/push")) {
    maxRequests = 10;
  } else {
    return false;
  }

  const key = `${ip}:${path.split("/").slice(0, 3).join("/")}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  return entry.count > maxRequests;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rate limiting for API routes
  if (pathname.startsWith("/api/flow") || pathname.startsWith("/api/push")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip, pathname)) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }
  }

  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self)");

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static files and _next
    "/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|js|css|woff|woff2)).*)",
  ],
};

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/api/accounts/:path*", "/api/trades/:path*", "/api/metrics/:path*", "/api/risk/:path*"],
};

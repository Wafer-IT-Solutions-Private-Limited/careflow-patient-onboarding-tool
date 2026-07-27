export { proxy as middleware } from "@/proxy";

export const config = {
  matcher: ["/admin/:path*", "/doctor/:path*", "/patient/:path*", "/walk-in/:path*", "/health-setup", "/health-setup/:path*"],
};

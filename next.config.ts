import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "@prisma/driver-adapter-utils",
    "pg",
  ],
  turbopack: {},
};

export default nextConfig;

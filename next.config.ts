import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the file-tracing root to this project directory. Without this, Vercel's
  // build adapter re-roots Turbopack's output-file traces and writes
  // middleware.js.nft.json to an offset path, so the build finalize step fails
  // with ENOENT on middleware.js.nft.json. See vercel/next.js#88579.
  outputFileTracingRoot: path.resolve(__dirname),
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "@prisma/driver-adapter-utils",
    "pg",
  ],
};

export default nextConfig;

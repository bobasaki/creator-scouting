import path from "path";
import type { NextConfig } from "next";

const backendUrl = (process.env.BACKEND_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);
const allowedDevOrigins = (
  process.env.DEV_ALLOWED_ORIGINS ??
  "http://localhost:3001,http://127.0.0.1:3001"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins,
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;

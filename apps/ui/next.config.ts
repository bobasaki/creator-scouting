import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://192.168.1.150:3001",
  ],
};

export default nextConfig;

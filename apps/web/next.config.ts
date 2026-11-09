import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // UI only. All business logic and data access go through FastAPI (ADR-0001);
  // route handlers here hold no business logic.
  reactStrictMode: true,
};

export default nextConfig;

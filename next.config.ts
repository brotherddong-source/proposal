import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/generate': ['./prompts/**/*'],
    '/api/revise': ['./prompts/**/*'],
    '/api/image-prompts': ['./prompts/**/*'],
  },
};

export default nextConfig;

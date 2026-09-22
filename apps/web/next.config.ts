import type { NextConfig } from "next";

const config: NextConfig = {
  // Contracts are consumed as TypeScript source from the workspace.
  transpilePackages: ["@pacaembu/contracts"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;

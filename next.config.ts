import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone: a self-contained server bundle (server.js +
  // only the node_modules actually used). Deployed as-is to Azure App Service
  // so the CI build is the only build — Azure just runs `node server.js`,
  // no Oryx remote build needed. See .github/workflows/azure-deploy.yml.
  output: "standalone",
};

export default nextConfig;

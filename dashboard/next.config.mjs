/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  httpAgentOptions: {
    keepAlive: false,
  },
};

export default nextConfig;

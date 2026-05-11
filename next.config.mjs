/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@mariozechner/pi-coding-agent',
      '@mariozechner/pi-agent-core',
      '@mariozechner/pi-ai',
      'puppeteer',
      '@prisma/client',
      'prisma',
    ],
  },
};

export default nextConfig;

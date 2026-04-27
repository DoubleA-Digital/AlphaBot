import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['yahoo-finance2', 'technicalindicators'],
  turbopack: {},
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint is run explicitly via `npm run lint`; never block a production build on it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

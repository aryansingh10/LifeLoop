import type { NextConfig } from 'next';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

// The browser talks only to the Next.js origin; requests are proxied to the API.
// Same-origin means the httpOnly session cookie works without CORS or third-party cookies.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/graphql', destination: `${API_ORIGIN}/graphql` },
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        // The service worker must never be served stale, or fixes to it would take days to reach phones.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

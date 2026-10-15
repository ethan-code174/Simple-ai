/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const nextConfig = {
  reactStrictMode: true,
  // The browser only ever talks to this Next.js app; /api/* is proxied to FastAPI.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};
export default nextConfig;

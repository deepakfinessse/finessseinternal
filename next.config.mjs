/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    // proxy.js runs on every request, including chat uploads (up to 10 × 1 MB
    // files per message, see src/lib/chat.js). The default 10 MB leaves no
    // headroom for the multipart overhead and text, so it could truncate them.
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No dev-mode badge: it overlaps the bottom nav in screenshots and screen recordings.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

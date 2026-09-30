import type { NextConfig } from "next";

/**
 * Where `/api/*` goes. Default `:3001`, which is the Hono server `scripts/dev.sh` boots.
 *
 * **A rewrite rather than a CORS negotiation, and that is the whole reason it exists.**
 * `createApp` mounts `hono/cors` only when `CORS_ALLOWED_ORIGINS` is set, and it is unset in
 * dev — so a browser on :3000 calling :3001 directly is blocked with no header to negotiate,
 * and the failure surfaces as an unreachable API rather than as a refusal. The Vite app never
 * met this because it proxies. This is the same proxy, one config file over.
 *
 * Not `NEXT_PUBLIC_`: the rewrite is resolved by the Next server, never by the browser, so
 * the target must not ship in the bundle. A split-origin production deploy sets
 * `NEXT_PUBLIC_BF_API_URL` instead and adds this app's origin to `CORS_ALLOWED_ORIGINS` —
 * see `lib/api/bf-client.ts`.
 */
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/:path*`,
      },
      // Signed blob URLs under local-disk storage are root-relative
      // (`BLOB_PUBLIC_BASE_URL=/blobs`), so the browser sends the PUT and the
      // read to this origin. Without this every upload in dev — photography,
      // decks, calendar attachments — 404s here. The Vite app proxies `/blobs`
      // for the same reason. Supabase storage signs absolute URLs and never
      // reaches this rewrite. The server mounts `/blobs` at its root, so the
      // prefix is kept, unlike `/api`.
      {
        source: "/blobs/:path*",
        destination: `${API_PROXY_TARGET}/blobs/:path*`,
      },
    ];
  },
};

export default nextConfig;

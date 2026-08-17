// NOTE: this is `proxy.ts`, not `middleware.ts` — Next.js 16 renamed the file
// convention (functionality is identical). See node_modules/next/dist/docs/
// 01-app/03-api-reference/03-file-conventions/proxy.md.
//
// Optimistic check only (reads the JWT from the cookie, no DB call) per
// Next.js's own auth guidance — real authorization still happens in
// server/trpc.ts's protectedProcedure on every actual data access.
export { auth as proxy } from "@/auth";

export const config = {
  // Run on everything except: Auth.js's own routes, static assets, the login
  // page itself (avoids a redirect loop), and the PWA plumbing added for the
  // app to be installable — manifest.webmanifest, icon/apple-icon and the
  // /icons/* routes it points to (app/manifest.ts), sw.js (public/), and the
  // offline fallback page (app/offline) it precaches. All of these must stay
  // reachable without a session — /offline in particular needs to render
  // even when the auth check itself can't happen (no connectivity).
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|login|manifest.webmanifest|sw.js|offline|icon|apple-icon).*)",
  ],
};

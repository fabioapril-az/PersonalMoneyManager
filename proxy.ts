// NOTE: this is `proxy.ts`, not `middleware.ts` — Next.js 16 renamed the file
// convention (functionality is identical). See node_modules/next/dist/docs/
// 01-app/03-api-reference/03-file-conventions/proxy.md.
//
// Optimistic check only (reads the JWT from the cookie, no DB call) per
// Next.js's own auth guidance — real authorization still happens in
// server/trpc.ts's protectedProcedure on every actual data access.
export { auth as proxy } from "@/auth";

export const config = {
  // Run on everything except: Auth.js's own routes, static assets, and the
  // login page itself (avoids a redirect loop).
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)"],
};

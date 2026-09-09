export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    /*
     * Gate every route except:
     * - api/auth        NextAuth's OAuth endpoints
     * - signin          the sign-in page
     * - join            public invitation-accept page
     * - 403 / suspended access-state pages
     * - _next/*, favicon, and any file with an extension
     */
    "/((?!api/auth|signin|join|403|suspended|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)",
  ],
};

import { cookies, headers } from "next/headers";
import { collections } from "./db";

const COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export const APP_VERSION =
  process.env.APP_VERSION || process.env.npm_package_version || "0.1.0";

export async function getCurrentSessionToken() {
  const jar = await cookies();
  for (const name of COOKIE_NAMES) {
    const c = jar.get(name);
    if (c?.value) return c.value;
  }
  return null;
}

function clientIp(h) {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "";
}

/**
 * Records device / IP / last-seen / running version onto the active session row.
 * Call once from the authenticated layout. Best-effort — never throws.
 */
export async function touchSession() {
  try {
    const token = await getCurrentSessionToken();
    if (!token) return;
    const h = await headers();
    const { sessions } = await collections();
    await sessions.updateOne(
      { sessionToken: token },
      {
        $set: {
          userAgent: h.get("user-agent") || "",
          ip: clientIp(h),
          appVersion: APP_VERSION,
          lastSeenAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
    );
  } catch (err) {
    console.error("[session-tracking] touch failed", err);
  }
}

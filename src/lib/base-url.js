import { headers } from "next/headers";

/** Absolute origin for building links inside emails (invites, assignments, …). */
export async function baseUrl() {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

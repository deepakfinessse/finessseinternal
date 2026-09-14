import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/access";
import { listNotifications, unreadCount } from "@/lib/notifications";

// Polled by the notification bell every few seconds — keep it cheap and
// always fresh (no caching at any layer).
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [items, count] = await Promise.all([
    listNotifications(me.id, { limit: 30 }),
    unreadCount(me.id),
  ]);
  return NextResponse.json(
    { items, unreadCount: count },
    { headers: { "Cache-Control": "no-store" } },
  );
}

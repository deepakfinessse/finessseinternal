import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/access";
import { unreadChatCount } from "@/lib/chat";

// Polled globally by the topbar chat badge — keep it cheap and always fresh.
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const chatUnread = await unreadChatCount(me.id);
  return NextResponse.json(
    { chatUnread },
    { headers: { "Cache-Control": "no-store" } },
  );
}

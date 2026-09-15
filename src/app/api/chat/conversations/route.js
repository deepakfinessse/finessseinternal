import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/access";
import { listConversationsForUser } from "@/lib/chat";

// Polled by the chat page's conversation list — keep it cheap and always fresh.
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conversations = await listConversationsForUser(me.id);
  return NextResponse.json(
    { conversations },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse } from "next/server";
import { getCurrentUser, AccessError } from "@/lib/access";
import { listMessages } from "@/lib/chat";

// Polled (~2-3s) by the open conversation pane — keep it cheap and always fresh.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");
  const after = searchParams.get("after") || undefined;
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  try {
    const messages = await listMessages(conversationId, me.id, { limit: 50, after });
    return NextResponse.json(
      { messages },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}

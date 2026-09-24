import { NextResponse } from "next/server";
import { getCurrentUser, AccessError } from "@/lib/access";
import { listMessages, sendMessage } from "@/lib/chat";

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

// Messages with attachments come through here as multipart/form-data (server
// actions cap bodies at 1 MB); plain text messages still use the server action.
export async function POST(request) {
  const me = await getCurrentUser();
  if (!me || me.status !== "active") return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload failed — the file may be too large." }, { status: 400 });
  }
  const conversationId = String(form.get("conversationId") || "");
  if (!conversationId) return NextResponse.json({ error: "Missing conversation." }, { status: 400 });
  const files = form.getAll("files").filter((f) => typeof f === "object" && f !== null && "arrayBuffer" in f);

  try {
    const message = await sendMessage({
      conversationId,
      senderId: me.id,
      text: String(form.get("text") || ""),
      files,
    });
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

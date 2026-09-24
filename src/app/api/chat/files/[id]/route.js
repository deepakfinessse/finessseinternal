import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser, AccessError } from "@/lib/access";
import { openChatFile, isInlineType } from "@/lib/chat";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const { file, stream } = await openChatFile(id, me.id);
    const contentType = file.metadata?.contentType || "application/octet-stream";
    const inline = isInlineType(contentType);
    const download = new URL(request.url).searchParams.has("download");
    const disposition = inline && !download ? "inline" : "attachment";

    return new Response(Readable.toWeb(stream), {
      headers: {
        "Content-Type": inline ? contentType : "application/octet-stream",
        "Content-Length": String(file.length),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "X-Content-Type-Options": "nosniff",
        // Chrome's PDF viewer refuses to load in a sandboxed document.
        ...(contentType === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox" }),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}

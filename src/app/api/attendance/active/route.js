import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/access";
import { getActiveSession } from "@/lib/attendance";

// Polled by the topbar clock widget — keep it cheap and always fresh.
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.can("attendance:track")) return NextResponse.json({ session: null });

  const session = await getActiveSession(me.id);
  return NextResponse.json({ session }, { headers: { "Cache-Control": "no-store" } });
}

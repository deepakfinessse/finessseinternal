import { getCurrentUser } from "@/lib/access";
import { listAllSessions, summarizeByDay } from "@/lib/attendance";

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString() : "";
}

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || !user.can("attendance:read:all")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const userId = searchParams.get("user") || undefined;

  const sessions = await listAllSessions({
    from: from ? `${from}T00:00:00` : undefined,
    to: to ? `${to}T23:59:59.999` : undefined,
    userId,
  });
  const rows = summarizeByDay(sessions);

  const header = ["Name", "Email", "Date", "First in", "Last out", "Total hours", "Sessions"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.user.name || "",
        r.user.email || "",
        r.day,
        fmtDateTime(r.firstIn),
        r.open ? "In progress" : fmtDateTime(r.lastOut),
        (r.totalMs / 3600000).toFixed(2),
        r.sessionCount,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${stamp}.csv"`,
    },
  });
}

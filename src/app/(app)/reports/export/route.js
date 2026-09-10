import { getCurrentUser } from "@/lib/access";
import { assigneeScorecard } from "@/lib/pm-data";

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || !user.can("analytics:read")) {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await assigneeScorecard({ months: 6 });
  const header = [
    "Assignee",
    "Email",
    "Divisions",
    "Completed",
    "On time",
    "Late",
    "On-time rate %",
    "Avg overrun (days)",
    "Active",
  ];
  const lines = [header.join(",")];
  for (const s of rows) {
    lines.push(
      [
        s.user.name || s.user.email,
        s.user.email,
        s.divisions.join(" / "),
        s.completed,
        s.onTime,
        s.late,
        s.onTimeRate ?? "",
        s.avgOverrunDays || "",
        s.active,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="assignee-scorecard-${stamp}.csv"`,
    },
  });
}

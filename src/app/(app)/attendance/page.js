import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { listMySessions, listAllSessions, summarizeByDay } from "@/lib/attendance";
import { listUsers } from "@/lib/data";
import { nowMs } from "@/lib/pm-constants";
import { PageHeader, Card, EmptyState, Avatar, Field, inputClass } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Attendance · Finessse" };

function fmtHours(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// `day` is a "YYYY-MM-DD" bucket key — parse as UTC so the local timezone
// can't shift it onto the neighboring date.
function fmtDayKey(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function AttendancePage({ searchParams }) {
  const user = await requirePermission("attendance:track");
  const sp = await searchParams;
  const canSeeAll = user.can("attendance:read:all");

  const today = new Date(nowMs()).toISOString().slice(0, 10);
  const defaultFrom = new Date(nowMs() - 13 * 86400000).toISOString().slice(0, 10);
  const from = sp.from || defaultFrom;
  const to = sp.to || today;
  const personId = sp.user || "";

  const [mySessions, allSessions, people] = await Promise.all([
    listMySessions(user.id),
    canSeeAll
      ? listAllSessions({ from: `${from}T00:00:00`, to: `${to}T23:59:59.999`, userId: personId || undefined })
      : [],
    canSeeAll ? listUsers({ status: "active" }) : [],
  ]);
  const myDailyRows = summarizeByDay(mySessions);
  const dailyRows = canSeeAll ? summarizeByDay(allSessions) : [];
  const exportHref = `/attendance/export?from=${from}&to=${to}${personId ? `&user=${personId}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="People"
        title="Attendance"
        description="Clock in from the top bar to start tracking your working hours."
      />

      <Card title="My history" description="First clock-in and last clock-out per day.">
        {myDailyRows.length === 0 ? (
          <EmptyState title="No sessions yet">Clock in from the top bar to start tracking.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-gray/15 text-sm">
            {myDailyRows.map((r) => (
              <li key={r.day} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="font-medium">{fmtDayKey(r.day)}</div>
                  <div className="text-xs text-gray">
                    {fmtTime(r.firstIn)} → {r.open ? "in progress" : fmtTime(r.lastOut)}
                    {r.sessionCount > 1 && ` · ${r.sessionCount} sessions`}
                  </div>
                </div>
                <div className="mono text-[13px] font-semibold tabular-nums">{fmtHours(r.totalMs)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canSeeAll && (
        <Card
          title="Team report"
          description="First in, last out and total hours, per person per day."
          action={
            <a
              href={exportHref}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-line-strong px-3 py-[7px] text-[12px] font-semibold text-dim transition-colors hover:bg-surface-2 hover:text-text"
            >
              <Icon name="reports" size={14} /> Download CSV
            </a>
          }
        >
          <form className="mb-4 flex flex-wrap items-end gap-2">
            <Field label="Person">
              <select name="user" defaultValue={personId} className={inputClass}>
                <option value="">Everyone</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From">
              <input type="date" name="from" defaultValue={from} className={inputClass} />
            </Field>
            <Field label="To">
              <input type="date" name="to" defaultValue={to} className={inputClass} />
            </Field>
            <button
              type="submit"
              className="rounded-[10px] border border-gray/25 px-3.5 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
            >
              Filter
            </button>
            <Link
              href="/attendance"
              className="rounded-[10px] px-3.5 py-2 text-sm font-semibold text-gray hover:text-primary"
            >
              Clear
            </Link>
          </form>

          {dailyRows.length === 0 ? (
            <EmptyState title="No attendance in this range" />
          ) : (
            <ul className="flex flex-col divide-y divide-gray/15 text-sm">
              {dailyRows.map((r) => (
                <li key={`${r.user.id}:${r.day}`} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.user.name} email={r.user.email} src={r.user.image} size={24} />
                    <div>
                      <div className="font-medium">{r.user.name || r.user.email}</div>
                      <div className="text-xs text-gray">
                        {fmtDayKey(r.day)} · {fmtTime(r.firstIn)} → {r.open ? "in progress" : fmtTime(r.lastOut)}
                      </div>
                    </div>
                  </div>
                  <div className="mono text-[13px] font-semibold tabular-nums">{fmtHours(r.totalMs)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

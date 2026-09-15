import Link from "next/link";
import { requirePermission } from "@/lib/access";
import {
  analyticsOverview,
  globalAssigneeView,
  calendarTasks,
  statusHeatmap,
  slaReport,
} from "@/lib/pm-data";
import { listDivisions } from "@/lib/divisions";
import { TASK_STATUSES, STATUS_LABEL } from "@/lib/pm-constants";
import { Card, Stat, EmptyState, fmtDate } from "@/components/ui";
import { TaskStatusBadge, OverdueTag } from "@/components/pm-ui";

export const metadata = { title: "Admin intelligence · Finessse" };

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export default async function AnalyticsPage() {
  await requirePermission("analytics:read");

  const now = new Date();
  const from = startOfWeek(now);
  const to = new Date(from);
  to.setDate(to.getDate() + 7 * 6); // six weeks out

  const [overview, assignees, calendar, heatmap, sla, divisions] = await Promise.all([
    analyticsOverview(),
    globalAssigneeView(),
    calendarTasks({ from, to }),
    statusHeatmap(),
    slaReport({ months: 6 }),
    listDivisions(),
  ]);

  // group calendar tasks by ISO week
  const weeks = [];
  for (let i = 0; i < 6; i++) {
    const wStart = new Date(from);
    wStart.setDate(wStart.getDate() + i * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 7);
    weeks.push({
      start: wStart,
      end: wEnd,
      tasks: calendar.filter((t) => {
        const d = new Date(t.endDate);
        return d >= wStart && d < wEnd;
      }),
    });
  }

  const heatMax = Math.max(
    1,
    ...divisions.flatMap((d) => TASK_STATUSES.map((s) => heatmap[d.key]?.[s] || 0)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">Admin intelligence &amp; reporting</h1>
        <p className="text-sm text-gray">Section 5 — the analytics engine over every project and task.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active projects" value={overview.activeProjects} />
        <Stat label="Total tasks" value={overview.totalTasks} />
        <Stat label="Completion rate" value={`${overview.completionRate}%`} />
        <Stat label="Blocked" value={overview.blocked} />
        <Stat label="Overdue" value={overview.overdue} />
        <Stat label="Awaiting approval" value={overview.awaitingApproval} />
      </div>

      <Card title="Global assignee task view" description="Every executor's live workload.">
        {assignees.length === 0 ? (
          <EmptyState title="No assigned tasks yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray/20 text-left text-xs uppercase text-gray">
                  <th className="py-2 pr-3 font-semibold">Assignee</th>
                  <th className="py-2 pr-3 font-semibold">Open</th>
                  <th className="py-2 pr-3 font-semibold">In progress</th>
                  <th className="py-2 pr-3 font-semibold">In review</th>
                  <th className="py-2 pr-3 font-semibold">Blocked</th>
                  <th className="py-2 pr-3 font-semibold">Completed</th>
                  <th className="py-2 pr-3 font-semibold">Overdue</th>
                  <th className="py-2 pr-3 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray/15">
                {assignees.map((a) => (
                  <tr key={a.user.id} className="hover:bg-gray/5">
                    <td className="py-2 pr-3">
                      <Link href={`/tasks?assignee=${a.user.id}`} className="font-semibold hover:text-primary">
                        {a.user.name || a.user.email}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{a.open}</td>
                    <td className="py-2 pr-3">{a.in_progress}</td>
                    <td className="py-2 pr-3">{a.in_review}</td>
                    <td className="py-2 pr-3">{a.blocked}</td>
                    <td className="py-2 pr-3">{a.completed}</td>
                    <td className={`py-2 pr-3 ${a.overdue ? "font-semibold text-secondary" : ""}`}>{a.overdue}</td>
                    <td className="py-2 pr-3 font-semibold">{a.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Due-date timeline" description="Next six weeks by deadline.">
          <ol className="flex flex-col gap-3">
            {weeks.map((w, i) => (
              <li key={i}>
                <div className="text-xs font-semibold uppercase text-gray">
                  {fmtDate(w.start.toISOString())} – {fmtDate(new Date(w.end - 1).toISOString())}
                  <span className="ml-2 text-gray/70">{w.tasks.length} due</span>
                </div>
                {w.tasks.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-1">
                    {w.tasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray/15 px-2.5 py-1.5 text-sm">
                        <Link href={`/tasks/${t.id}`} className="min-w-0 truncate hover:text-primary">
                          {t.title}
                        </Link>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-gray">
                          <OverdueTag show={t.overdue && t.status !== "completed"} />
                          {fmtDate(t.endDate)}
                          <TaskStatusBadge status={t.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Status & overdue heatmap" description="Tasks by division and state.">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="text-left font-semibold text-gray">Division</th>
                  {TASK_STATUSES.map((s) => (
                    <th key={s} className="px-1 font-semibold text-gray">{STATUS_LABEL[s]}</th>
                  ))}
                  <th className="px-1 font-semibold text-secondary">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((d) => (
                  <tr key={d.key}>
                    <td className="whitespace-nowrap pr-2 text-gray">{d.label}</td>
                    {TASK_STATUSES.map((s) => {
                      const n = heatmap[d.key]?.[s] || 0;
                      return (
                        <td
                          key={s}
                          className="rounded text-center font-semibold"
                          style={{
                            backgroundColor: n
                              ? `color-mix(in srgb, var(--primary-color) ${Math.round((n / heatMax) * 70) + 12}%, transparent)`
                              : "transparent",
                          }}
                        >
                          {n || ""}
                        </td>
                      );
                    })}
                    <td
                      className="rounded text-center font-semibold"
                      style={{
                        backgroundColor: heatmap[d.key]?.overdue
                          ? `color-mix(in srgb, var(--secondary-color) ${Math.round(((heatmap[d.key].overdue) / heatMax) * 70) + 12}%, transparent)`
                          : "transparent",
                      }}
                    >
                      {heatmap[d.key]?.overdue || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Monthly SLA report" description="Completed tasks — on-time vs overdue history.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray/20 text-left text-xs uppercase text-gray">
                <th className="py-2 pr-3 font-semibold">Month</th>
                <th className="py-2 pr-3 font-semibold">Completed</th>
                <th className="py-2 pr-3 font-semibold">On time</th>
                <th className="py-2 pr-3 font-semibold">Overdue</th>
                <th className="py-2 pr-3 font-semibold">SLA</th>
                <th className="py-2 pr-3 font-semibold">On-time share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray/15">
              {sla.map((m) => (
                <tr key={m.month}>
                  <td className="py-2 pr-3 font-semibold">{m.month}</td>
                  <td className="py-2 pr-3">{m.total}</td>
                  <td className="py-2 pr-3">{m.onTime}</td>
                  <td className={`py-2 pr-3 ${m.overdue ? "text-secondary" : ""}`}>{m.overdue}</td>
                  <td className="py-2 pr-3">{m.slaPct === null ? "—" : `${m.slaPct}%`}</td>
                  <td className="py-2 pr-3">
                    <div className="h-2 w-40 overflow-hidden rounded-full bg-gray/15">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${m.slaPct ?? 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { requirePermission } from "@/lib/access";
import {
  deliverySla,
  assigneeScorecard,
  slaReport,
  generateBriefs,
} from "@/lib/pm-data";
import { PageHeader, Card, EmptyState, Avatar, fmtDateTime } from "@/components/ui";
import { RingGauge, Sparkline, RateBar } from "@/components/pm-ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Reports · Finessse" };

const TABS = [
  { key: "sla", label: "Delivery SLA" },
  { key: "history", label: "Monthly history" },
  { key: "briefs", label: "Generated briefs" },
];

function Kpi({ label, value, unit, hint, ring }) {
  return (
    <div className="card flex flex-col justify-between p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="mono text-[10px] uppercase tracking-[0.14em] text-faint">{label}</div>
        {ring != null && <RingGauge pct={ring} size={52} />}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[34px] font-semibold leading-none tracking-[-0.03em]">{value}</span>
        {unit && <span className="text-[13px] text-dim">{unit}</span>}
      </div>
      {hint && <p className="mt-2 text-[12px] leading-snug text-dim">{hint}</p>}
    </div>
  );
}

export default async function ReportsPage({ searchParams }) {
  const user = await requirePermission("analytics:read");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab : "sla";

  const [sla, scorecard, monthly, briefs] = await Promise.all([
    tab === "sla" ? deliverySla() : null,
    tab === "sla" ? assigneeScorecard({ months: 6 }) : null,
    tab === "history" ? slaReport({ months: 12 }) : null,
    tab === "briefs" ? generateBriefs() : null,
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Admin" title="Reports" description="Delivery performance and completion history." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-[10px] border border-line bg-surface p-0.5">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/reports?tab=${t.key}`}
              className={`rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                tab === t.key ? "bg-action text-action-text" : "text-dim hover:text-text"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {tab === "sla" && (
          <a
            href="/reports/export"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-line-strong px-3 py-[7px] text-[12px] font-semibold text-dim transition-colors hover:bg-surface-2 hover:text-text"
          >
            <Icon name="reports" size={14} /> Export CSV
          </a>
        )}
      </div>

      {tab === "sla" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="On-time rate"
              value={`${sla.onTimeRate}%`}
              ring={sla.onTimeRate}
              hint={`${sla.onTime} of ${sla.total} completions landed on or before the due date`}
            />
            <Kpi
              label="Late completions"
              value={sla.late}
              hint={
                sla.late
                  ? `Average overrun of ${sla.avgOverrunDays} days when a task slips`
                  : "No completed task has missed its due date"
              }
            />
            <Kpi
              label="Cycle time"
              value={sla.cycleTimeDays}
              unit="days"
              hint="Created → completed, averaged across all closed work"
            />
            <Kpi
              label="Weekly throughput"
              value={sla.weeklyThroughput}
              hint="Tasks closed per week, 4-week rolling average"
            />
          </div>

          <Card
            title="Assignee scorecard"
            description="Six months of completion history. On-time is measured against the due date at the moment of completion, so later date edits cannot rewrite the record."
          >
            {scorecard.length === 0 ? (
              <EmptyState title="No completion history yet">
                Metrics appear once tasks start getting approved.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.1em] text-faint">
                      <th className="py-2 pr-4 font-medium">Assignee</th>
                      <th className="py-2 pr-4 font-medium">Completed</th>
                      <th className="py-2 pr-4 font-medium">On time</th>
                      <th className="py-2 pr-4 font-medium">Late</th>
                      <th className="py-2 pr-4 font-medium">On-time rate</th>
                      <th className="py-2 pr-4 font-medium">Avg overrun</th>
                      <th className="py-2 pr-4 font-medium">Trend</th>
                      <th className="py-2 pr-2 font-medium">Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {scorecard.map((s) => (
                      <tr key={s.user.id} className="hover:bg-surface-2/40">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={s.user.name} email={s.user.email} size={26} />
                            <div className="min-w-0">
                              <Link
                                href={`/tasks?assignee=${s.user.id}`}
                                className="font-semibold hover:text-text"
                              >
                                {s.user.name || s.user.email}
                              </Link>
                              <div className="mono truncate text-[9px] uppercase tracking-[0.1em] text-faint">
                                {s.divisions.join(" · ") || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 font-semibold">{s.completed}</td>
                        <td className="py-3 pr-4 text-ok">{s.onTime}</td>
                        <td className={`py-3 pr-4 ${s.late ? "text-warn" : "text-faint"}`}>{s.late}</td>
                        <td className="py-3 pr-4">
                          <RateBar pct={s.onTimeRate} />
                        </td>
                        <td className="py-3 pr-4 text-dim">
                          {s.avgOverrunDays ? `${s.avgOverrunDays}d` : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          <Sparkline values={s.trend} />
                        </td>
                        <td className="py-3 pr-2">
                          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-dim">
                            {s.active}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "history" && (
        <Card title="Monthly completion history" description="On-time vs late, twelve months back.">
          {monthly.every((m) => m.total === 0) ? (
            <EmptyState title="No completions recorded" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.1em] text-faint">
                    <th className="py-2 pr-4 font-medium">Month</th>
                    <th className="py-2 pr-4 font-medium">Completed</th>
                    <th className="py-2 pr-4 font-medium">On time</th>
                    <th className="py-2 pr-4 font-medium">Late</th>
                    <th className="py-2 pr-4 font-medium">SLA</th>
                    <th className="py-2 pr-2 font-medium">On-time share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {monthly.map((m) => (
                    <tr key={m.month}>
                      <td className="mono py-2.5 pr-4">{m.month}</td>
                      <td className="py-2.5 pr-4 font-semibold">{m.total}</td>
                      <td className="py-2.5 pr-4 text-ok">{m.onTime}</td>
                      <td className={`py-2.5 pr-4 ${m.overdue ? "text-warn" : "text-faint"}`}>{m.overdue}</td>
                      <td className="py-2.5 pr-4">{m.slaPct == null ? "—" : `${m.slaPct}%`}</td>
                      <td className="py-2.5 pr-2">
                        <RateBar pct={m.slaPct} width={160} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "briefs" && (
        <div className="grid gap-4 md:grid-cols-2">
          {briefs.map((b) => (
            <Card key={b.id} title={b.title}>
              <p className="text-[13px] leading-relaxed text-dim">{b.body}</p>
              <div className="mono mt-3 text-[9px] uppercase tracking-[0.12em] text-faint">
                Generated {fmtDateTime(b.generatedAt)}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

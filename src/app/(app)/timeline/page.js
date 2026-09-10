import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { listTasks, listProjectOptions } from "@/lib/pm-data";
import { listUsers } from "@/lib/data";
import { divisionLabel, nowMs } from "@/lib/pm-constants";
import { resolveTaskFilters, filterListArgs, FILTER_COOKIE } from "@/lib/task-filters";
import { PageHeader, EmptyState } from "@/components/ui";
import { DeliveryFilters } from "@/components/delivery-filters";
import { Icon } from "@/components/icons";
import { divisionHsl } from "@/components/pm-ui";

export const metadata = { title: "Timeline · Finessse" };

const RANGES = [30, 60, 90];
const GROUPINGS = [
  { key: "person", label: "By person" },
  { key: "project", label: "By project" },
  { key: "division", label: "By division" },
];
const DAY = 86400000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function SegToggle({ options, current, param, hrefFor }) {
  return (
    <div className="inline-flex rounded-[10px] border border-line bg-surface p-0.5">
      {options.map((o) => {
        const val = typeof o === "object" ? o.key : o;
        const label = typeof o === "object" ? o.label : `${o}d`;
        const active = String(current) === String(val);
        return (
          <Link
            key={val}
            href={hrefFor({ [param]: val })}
            className={`rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              active ? "bg-action text-action-text" : "text-dim hover:text-text"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function TimelinePage({ searchParams }) {
  const user = await requireUser();
  if (!user.can("task:read") && !user.can("task:read:all")) redirect("/403");
  const sp = await searchParams;

  const by = GROUPINGS.some((g) => g.key === sp.by) ? sp.by : "person";
  const range = RANGES.includes(Number(sp.range)) ? Number(sp.range) : 60;
  const canSeeAll = user.can("task:read:all") || user.can("*");

  const cookieStore = await cookies();
  const filters = resolveTaskFilters({
    searchParams: sp,
    cookieValue: cookieStore.get(FILTER_COOKIE)?.value,
  });

  const [allTasks, projects, people] = await Promise.all([
    listTasks(user, filterListArgs(filters, user.id)),
    user.can("project:read") ? listProjectOptions() : [],
    canSeeAll ? listUsers({ status: "active" }) : [],
  ]);
  const tasks = allTasks.filter((t) => t.endDate || t.startDate);

  const winStart = startOfDay(nowMs() - 5 * DAY);
  const winEnd = new Date(winStart.getTime() + range * DAY);
  const winDays = range;
  const today = startOfDay(nowMs());
  const dayW = range <= 30 ? 34 : range <= 60 ? 22 : 15;
  const gridW = winDays * dayW;

  // group
  const groups = new Map();
  const keyFns = {
    person: (t) => [t.assignee?.id || "_", t.assignee?.name || "Unassigned"],
    project: (t) => [t.project?.id || "_", t.project?.name || "No project"],
    division: (t) => [t.division || "_", divisionLabel(t.division)],
  };
  for (const t of tasks) {
    const [id, label] = keyFns[by](t);
    if (!groups.has(id)) groups.set(id, { id, label, tasks: [] });
    groups.get(id).tasks.push(t);
  }
  const rows = [...groups.values()].sort((a, b) => b.tasks.length - a.tasks.length);

  const days = Array.from({ length: winDays }, (_, i) => new Date(winStart.getTime() + i * DAY));
  const todayPx = 220 + (((today.getTime() - winStart.getTime()) / (winDays * DAY)) * gridW);

  const barGeom = (t) => {
    const end = startOfDay(t.endDate || t.startDate);
    let start = t.startDate ? startOfDay(t.startDate) : new Date(end.getTime() - 2 * DAY);
    if (start > end) start = new Date(end.getTime() - DAY);
    const s = Math.max(start.getTime(), winStart.getTime());
    const e = Math.min(end.getTime() + DAY, winEnd.getTime());
    if (e <= winStart.getTime() || s >= winEnd.getTime()) return null;
    const left = ((s - winStart.getTime()) / (winDays * DAY)) * 100;
    const width = Math.max(((e - s) / (winDays * DAY)) * 100, 1.4);
    return { left, width };
  };

  const seg = (patch) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v != null && v !== "") p.set(k, Array.isArray(v) ? v[0] : String(v));
    }
    p.set("by", by);
    p.set("range", String(range));
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, String(v)) : p.delete(k));
    return `/timeline?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Delivery" title="Timeline" description="Scheduled work across the delivery window." />

      <DeliveryFilters
        value={filters}
        projects={projects}
        people={people.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
        canSeeAll={canSeeAll}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegToggle options={GROUPINGS} current={by} param="by" hrefFor={seg} />
          <SegToggle options={RANGES} current={range} param="range" hrefFor={seg} />
        </div>
        <span className="mono flex items-center gap-1.5 text-[10px] uppercase tracking-[0.13em] text-faint">
          <Icon name="tools" size={12} /> Dates are admin-controlled
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nothing scheduled">
          Tasks need a start or end date to appear on the timeline.
        </EmptyState>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <div style={{ minWidth: gridW + 220 }}>
              {/* date header */}
              <div className="flex border-b border-line">
                <div className="w-[220px] shrink-0 px-4 py-2.5">
                  <span className="mono text-[10px] uppercase tracking-[0.13em] text-faint">
                    {GROUPINGS.find((g) => g.key === by).label.replace("By ", "")}
                  </span>
                </div>
                <div className="relative flex-1" style={{ width: gridW }}>
                  <div className="flex">
                    {days.map((d, i) => {
                      const isToday = d.getTime() === today.getTime();
                      const isMonthStart = d.getDate() === 1;
                      return (
                        <div
                          key={i}
                          style={{ width: dayW }}
                          className={`shrink-0 border-l py-2 text-center ${
                            isMonthStart ? "border-line-strong" : "border-line/40"
                          }`}
                        >
                          <div className={`text-[10px] ${isToday ? "font-bold text-accent" : "text-faint"}`}>
                            {d.getDate()}
                          </div>
                          <div className="text-[8px] uppercase text-faint/70">
                            {["S", "M", "T", "W", "T", "F", "S"][d.getDay()]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* rows */}
              <div className="relative">
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-accent/60"
                  style={{ left: todayPx }}
                />
                {rows.map((row) => (
                  <div key={row.id} className="flex items-stretch border-b border-line last:border-0">
                    <div className="w-[220px] shrink-0 px-4 py-4">
                      <div className="text-[13px] font-semibold leading-tight">{row.label}</div>
                      <div className="mono mt-0.5 text-[9px] uppercase tracking-[0.13em] text-faint">
                        {row.tasks.length} task{row.tasks.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="relative flex-1 py-3" style={{ width: gridW }}>
                      {row.tasks.map((t, i) => {
                        const g = barGeom(t);
                        if (!g) return null;
                        const hsl = divisionHsl(t.division);
                        const warn = t.overdue && t.status !== "completed";
                        return (
                          <Link
                            key={t.id}
                            href={`/tasks/${t.id}`}
                            title={t.title}
                            style={{
                              left: `${g.left}%`,
                              width: `${g.width}%`,
                              top: 12 + (i % 3) * 30,
                              background: warn
                                ? "var(--warn-bg)"
                                : `hsl(${hsl} / 0.16)`,
                              borderColor: warn
                                ? "color-mix(in srgb, var(--warn) 50%, transparent)"
                                : `hsl(${hsl} / 0.5)`,
                              color: warn ? "var(--warn)" : `hsl(${hsl})`,
                            }}
                            className="absolute flex h-[24px] items-center gap-1.5 overflow-hidden rounded-[7px] border px-2 text-[11px] font-medium hover:brightness-110"
                          >
                            <span className="truncate">{t.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

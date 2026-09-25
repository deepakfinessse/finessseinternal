import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { listTasks, statusHeatmap, listProjectOptions } from "@/lib/pm-data";
import { listUsers } from "@/lib/data";
import { listDivisions } from "@/lib/divisions";
import { TASK_STATUSES, STATUS_LABEL, nowMs } from "@/lib/pm-constants";
import { resolveTaskFilters, filterListArgs, FILTER_COOKIE } from "@/lib/task-filters";
import { PageHeader, EmptyState, Avatar } from "@/components/ui";
import { DeliveryFilters } from "@/components/delivery-filters";

export const metadata = { title: "Heatmap · Finessse" };

const VIEWS = [
  { key: "due", label: "Due dates" },
  { key: "load", label: "Active load" },
  { key: "matrix", label: "Status matrix" },
];
const DAY = 86400000;
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export default async function HeatmapPage({ searchParams }) {
  const user = await requireUser();
  // Team-wide load view — managers/admins only (analytics:read), not assignees.
  if (!user.can("analytics:read")) redirect("/403");
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? sp.view : "due";
  const canSeeAll = user.can("task:read:all") || user.can("*");

  const cookieStore = await cookies();
  const filters = resolveTaskFilters({
    searchParams: sp,
    cookieValue: cookieStore.get(FILTER_COOKIE)?.value,
  });

  const [tasks, people, projects, matrix, divisions] = await Promise.all([
    listTasks(user, filterListArgs(filters, user.id)),
    canSeeAll ? listUsers({ status: "active" }) : [],
    user.can("project:read") ? listProjectOptions({ user }) : [],
    view === "matrix" ? statusHeatmap() : null,
    listDivisions(),
  ]);

  // people to show as rows — those with tasks, fall back to active users
  const withTasks = new Map();
  for (const t of tasks) {
    if (!t.assignee?.id) continue;
    if (!withTasks.has(t.assignee.id))
      withTasks.set(t.assignee.id, { ...t.assignee, tasks: [] });
    withTasks.get(t.assignee.id).tasks.push(t);
  }
  const rows = [...withTasks.values()].sort((a, b) => b.tasks.length - a.tasks.length);

  const today = startOfDay(nowMs());
  const gridStart = startOfDay(today.getTime() - 14 * DAY);
  const NCOLS = 63; // 9 weeks
  const days = Array.from({ length: NCOLS }, (_, i) => new Date(gridStart.getTime() + i * DAY));

  const seg = (v) => {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) {
      if (k !== "view" && val != null && val !== "") {
        p.set(k, Array.isArray(val) ? val[0] : String(val));
      }
    }
    p.set("view", v);
    return `/heatmap?${p.toString()}`;
  };

  const cellTone = (personTasks, day) => {
    const key = ymd(day);
    const hits = personTasks.filter((t) => t.endDate && ymd(t.endDate) === key);
    if (!hits.length) return null;
    const dayTime = startOfDay(day).getTime();
    const openHits = hits.filter((t) => t.status !== "completed");
    if (openHits.length && dayTime < today.getTime()) return "overdue";
    return "scheduled";
  };
  const TONE_BG = {
    overdue: "var(--warn)",
    scheduled: "var(--ok)",
  };

  // active load per person per week
  const WEEKS = 9;
  const weekStart = (i) => new Date(gridStart.getTime() + i * 7 * DAY);
  const loadFor = (personTasks, wi) => {
    const s = weekStart(wi).getTime();
    const e = s + 7 * DAY;
    return personTasks.filter(
      (t) => t.status !== "completed" && t.endDate && +new Date(t.endDate) >= s && +new Date(t.endDate) < e,
    ).length;
  };
  const loadMax = Math.max(1, ...rows.flatMap((r) => Array.from({ length: WEEKS }, (_, wi) => loadFor(r.tasks, wi))));

  const matrixMax = matrix
    ? Math.max(1, ...divisions.flatMap((d) => TASK_STATUSES.map((s) => matrix[d.key]?.[s] || 0)))
    : 1;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Delivery" title="Heatmap" description="Where the deadlines pile up." />

      <DeliveryFilters
        value={filters}
        projects={projects}
        people={people.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
        divisions={divisions}
        canSeeAll={canSeeAll}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-[10px] border border-line bg-surface p-0.5">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={seg(v.key)}
              className={`rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                view === v.key ? "bg-action text-action-text" : "text-dim hover:text-text"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>

      {view === "matrix" ? (
        <div className="card overflow-x-auto p-5">
          <table className="w-full border-separate border-spacing-1 text-[12px]">
            <thead>
              <tr>
                <th className="text-left font-medium text-faint">Division</th>
                {TASK_STATUSES.map((s) => (
                  <th key={s} className="px-2 font-medium text-faint">{STATUS_LABEL[s]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {divisions.map((d) => (
                <tr key={d.key}>
                  <td className="whitespace-nowrap pr-3 text-dim">{d.label}</td>
                  {TASK_STATUSES.map((s) => {
                    const n = matrix[d.key]?.[s] || 0;
                    return (
                      <td
                        key={s}
                        className="h-9 rounded-md text-center font-semibold"
                        style={{
                          background: n
                            ? `color-mix(in srgb, var(--accent) ${12 + Math.round((n / matrixMax) * 68)}%, transparent)`
                            : "var(--surface-2)",
                          color: n ? "var(--text)" : "var(--text-faint)",
                        }}
                      >
                        {n || "·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No assigned work" />
      ) : (
        <div className="card overflow-x-auto p-5">
          {view === "due" ? (
            <>
              <div className="flex" style={{ minWidth: 180 + NCOLS * 15 }}>
                <div className="w-[180px] shrink-0" />
                <div className="flex flex-1">
                  {days.map((d, i) => (
                    <div
                      key={i}
                      style={{ width: 15 }}
                      className="text-center text-[8px] text-faint"
                    >
                      {d.getDate() === 1 || i === 0
                        ? d.toLocaleDateString(undefined, { month: "short" })
                        : d.getDay() === 1
                          ? d.getDate()
                          : ""}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-1 flex flex-col gap-1" style={{ minWidth: 180 + NCOLS * 15 }}>
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center">
                    <div className="flex w-[180px] shrink-0 items-center gap-2">
                      <Avatar name={r.name} email={r.email} src={r.image} size={20} />
                      <span className="truncate text-[12px]">{r.name || r.email}</span>
                    </div>
                    <div className="flex flex-1 gap-[2px]">
                      {days.map((d, i) => {
                        const tone = cellTone(r.tasks, d);
                        const isToday = ymd(d) === ymd(today);
                        return (
                          <div
                            key={i}
                            title={`${r.name} · ${d.toLocaleDateString()}`}
                            style={{
                              width: 13,
                              height: 13,
                              background: tone ? TONE_BG[tone] : "var(--surface-2)",
                              opacity: tone ? 0.9 : 1,
                              outline: isToday ? "1px solid var(--accent)" : "none",
                            }}
                            className="shrink-0 rounded-[3px]"
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-[10px] uppercase tracking-[0.1em] text-faint">
                <Legend color="var(--warn)" label="Overdue" />
                <Legend color="var(--ok)" label="Scheduled" />
                <Legend color="var(--surface-2)" label="Clear" />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1" style={{ minWidth: 180 + WEEKS * 44 }}>
              <div className="flex">
                <div className="w-[180px] shrink-0" />
                {Array.from({ length: WEEKS }, (_, wi) => (
                  <div key={wi} style={{ width: 44 }} className="text-center text-[9px] text-faint">
                    {weekStart(wi).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                ))}
              </div>
              {rows.map((r) => (
                <div key={r.id} className="flex items-center">
                  <div className="flex w-[180px] shrink-0 items-center gap-2">
                    <Avatar name={r.name} email={r.email} src={r.image} size={20} />
                    <span className="truncate text-[12px]">{r.name || r.email}</span>
                  </div>
                  {Array.from({ length: WEEKS }, (_, wi) => {
                    const n = loadFor(r.tasks, wi);
                    return (
                      <div key={wi} style={{ width: 44 }} className="px-1">
                        <div
                          className="flex h-8 items-center justify-center rounded-[6px] text-[11px] font-semibold"
                          style={{
                            background: n
                              ? `color-mix(in srgb, var(--accent) ${14 + Math.round((n / loadMax) * 66)}%, transparent)`
                              : "var(--surface-2)",
                            color: n ? "var(--text)" : "var(--text-faint)",
                          }}
                        >
                          {n || "·"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ background: color, width: 11, height: 11 }} className="rounded-[3px]" />
      {label}
    </span>
  );
}

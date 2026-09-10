import Link from "next/link";
import { cookies } from "next/headers";
import { requirePermission } from "@/lib/access";
import { listProjects, listTasks, listProjectOptions } from "@/lib/pm-data";
import { listUsers } from "@/lib/data";
import { divisionLabel } from "@/lib/pm-constants";
import { resolveTaskFilters, filterListArgs, FILTER_COOKIE } from "@/lib/task-filters";
import { PageHeader, Card, EmptyState, AvatarStack, fmtDate } from "@/components/ui";
import { DivisionDot, RingStat } from "@/components/pm-ui";
import { Icon } from "@/components/icons";
import { DeliveryFilters } from "@/components/delivery-filters";
import { ProjectForm } from "./project-forms";

export const metadata = { title: "Projects · Finessse" };

function MiniStat({ label, value, tone }) {
  const c = tone === "warn" ? "text-warn" : tone === "caution" ? "text-caution" : "";
  return (
    <div>
      <div className="mono text-[9px] uppercase tracking-[0.13em] text-faint">{label}</div>
      <div className={`mt-1 text-[20px] font-semibold leading-none tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

function ProjectCard({ p }) {
  const total = p.taskCounts.total;
  const trackPct = total ? Math.round((p.onTrack / total) * 100) : 0;
  const daysTone = p.daysLeft != null && p.daysLeft < 0 ? "warn" : undefined;

  return (
    <div className="card flex flex-col gap-4 p-5 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mono truncate text-[10px] uppercase tracking-[0.14em] text-faint">
            {p.client || "No client"}
          </div>
          <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.02em]">
            <Link href={`/projects/${p.id}`} className="hover:text-text">
              {p.name}
            </Link>
          </h3>
        </div>
        <RingStat pct={p.completionPct} size={46} />
      </div>

      {p.description && (
        <p className="line-clamp-2 text-[13px] leading-snug text-dim">{p.description}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {p.divisions.length === 0 ? (
          <span className="text-[11px] text-faint">No divisions assigned</span>
        ) : (
          p.divisions.map((d) => (
            <span
              key={d}
              className="mono inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[9.5px] uppercase tracking-[0.09em] text-dim"
            >
              <DivisionDot division={d} size={6} />
              {divisionLabel(d)}
            </span>
          ))
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 border-t border-line pt-4">
        <MiniStat label="Tasks" value={total} />
        <MiniStat label="Overdue" value={p.taskCounts.overdue} tone={p.taskCounts.overdue ? "warn" : undefined} />
        <MiniStat label="Blocked" value={p.taskCounts.blocked} tone={p.taskCounts.blocked ? "caution" : undefined} />
        <MiniStat
          label="Days left"
          value={p.daysLeft == null ? "—" : p.daysLeft < 0 ? Math.abs(p.daysLeft) : p.daysLeft}
          tone={daysTone}
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="mono text-[9px] uppercase tracking-[0.13em] text-faint">On track</span>
          <span className="mono text-[10px] text-dim">
            {p.onTrack} / {total}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-ok" style={{ width: `${trackPct}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-4">
        <div className="flex items-center gap-2.5">
          {p.people.length > 0 ? (
            <AvatarStack people={p.people} size={20} />
          ) : (
            <span className="text-[11px] text-faint">Unstaffed</span>
          )}
          <span className="mono text-[9px] uppercase tracking-[0.13em] text-faint">
            {p.targetDate ? `Target ${fmtDate(p.targetDate)}` : p.status}
          </span>
        </div>
        <Link
          href={`/projects/${p.id}`}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-dim transition-colors hover:text-text"
        >
          Open board
          <Icon name="chevron" size={13} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

export default async function ProjectsPage({ searchParams }) {
  const user = await requirePermission("project:read");
  const sp = await searchParams;
  const showForm = sp.new === "1" && user.can("project:create");

  const cookieStore = await cookies();
  const filters = resolveTaskFilters({
    searchParams: sp,
    cookieValue: cookieStore.get(FILTER_COOKIE)?.value,
  });

  // Task-oriented dimensions narrow the list to projects that *contain* a
  // matching task; division / project / q are project-level.
  const taskDims =
    filters.assignee.length ||
    filters.priority.length ||
    filters.mine ||
    filters.overdue ||
    filters.blocked;

  const [allProjects, matchTasks, projectOpts, people] = await Promise.all([
    listProjects({ divisions: filters.division, q: filters.q || undefined }),
    taskDims
      ? listTasks(user, filterListArgs({ ...filters, division: [], project: [] }, user.id))
      : null,
    user.can("project:read") ? listProjectOptions() : [],
    user.can("assignee:read") ? listUsers({ status: "active" }) : [],
  ]);

  let projects = allProjects;
  if (filters.project.length) {
    projects = projects.filter((p) => filters.project.includes(p.id));
  }
  if (matchTasks) {
    const hit = new Set(matchTasks.map((t) => t.projectId));
    projects = projects.filter((p) => hit.has(p.id));
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Delivery"
        title="Projects"
        description="Onboarding routes a project into divisions. Divisions decide who can be assigned."
        actions={
          user.can("project:create") ? (
            <Link
              href={showForm ? "/projects" : "/projects?new=1"}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-action px-3 py-[7px] text-[13px] font-semibold text-action-text transition-opacity hover:opacity-90"
            >
              {showForm ? "Close" : (<><Icon name="plus" size={14} strokeWidth={2} /> Onboard project</>)}
            </Link>
          ) : null
        }
      />

      {showForm && (
        <Card title="Onboard a project" description="Project & division setup.">
          <ProjectForm />
        </Card>
      )}

      <DeliveryFilters
        value={filters}
        projects={projectOpts}
        people={people.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
        canSeeAll={user.can("assignee:read")}
        showSearch
        searchPlaceholder="Search projects…"
      />

      {projects.length === 0 ? (
        <EmptyState title="No projects">
          {user.can("project:create") ? "Onboard one to get started." : "Nothing matches these filters."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

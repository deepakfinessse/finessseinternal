import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { listTasks, taskStats } from "@/lib/pm-data";
import { listUsers } from "@/lib/data";
import { DIVISIONS, TASK_STATUSES, STATUS_LABEL, divisionLabel } from "@/lib/pm-constants";
import { PageHeader, EmptyState, AvatarStack } from "@/components/ui";
import {
  DivisionLabel,
  StatusDot,
  BlockerChip,
  PriorityChip,
  ApprovalChip,
  OverdueTag,
  taskCode,
} from "@/components/pm-ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Board · Finessse" };

function TaskCard({ task }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="animate-in block rounded-[13px] border border-line bg-surface p-3.5 transition-colors hover:border-line-strong"
    >
      <div className="flex items-center justify-between gap-2">
        <DivisionLabel division={task.division} label={task.divisionLabel} />
        <span className="mono text-[10px] tracking-[0.06em] text-faint">{taskCode(task)}</span>
      </div>

      <h3 className="mt-2 text-[13.5px] font-semibold leading-snug tracking-[-0.01em] line-clamp-2">
        {task.title}
      </h3>

      {task.project?.client && (
        <p className="mt-1 text-[12px] text-dim">{task.project.client}</p>
      )}

      {(task.blocker?.active || task.priority === "high" || task.priority === "urgent" || task.approval === "pending" || task.approval === "rejected") && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {task.blocker?.active && <BlockerChip blocker={task.blocker} />}
          <PriorityChip priority={task.priority} />
          <ApprovalChip approval={task.approval} />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {(task.assignee || task.collaborators.length > 0) && (
            <AvatarStack
              people={[task.assignee, ...task.collaborators].filter(Boolean)}
              size={20}
            />
          )}
          {task.attachments.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-faint">
              <Icon name="link" size={13} />
              {task.attachments.length}
            </span>
          )}
        </div>
        {task.overdue && task.status !== "completed" ? (
          <OverdueTag show iso={task.endDate} />
        ) : task.endDate ? (
          <span className="text-[11px] text-faint">
            {new Date(task.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default async function BoardPage({ searchParams }) {
  const user = await requireUser();
  if (!user.can("task:read") && !user.can("task:read:all")) redirect("/403");
  const sp = await searchParams;

  const division = DIVISIONS.some((d) => d.key === sp.division) ? sp.division : undefined;
  const overdue = sp.overdue === "1";
  const assigneeId = sp.assignee || undefined;
  const q = (sp.q || "").trim();
  const canSeeAll = user.can("task:read:all") || user.can("*");

  const [tasks, stats, people] = await Promise.all([
    listTasks(user, { division, overdue, assigneeId, q: q || undefined }),
    taskStats(user),
    canSeeAll ? listUsers({ status: "active" }) : [],
  ]);

  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, []]));
  for (const t of tasks) (byStatus[t.status] || byStatus.open).push(t);

  const activeFilters = [
    overdue && { key: "overdue", label: "Overdue" },
    division && { key: "division", label: divisionLabel(division) },
    assigneeId && {
      key: "assignee",
      label: people.find((p) => p.id === assigneeId)?.name || "Assignee",
    },
    q && { key: "q", label: `“${q}”` },
  ].filter(Boolean);

  const buildQs = (patch = {}) => {
    const params = new URLSearchParams();
    const cur = {
      division,
      overdue: overdue ? "1" : "",
      assignee: assigneeId,
      q,
      ...patch,
    };
    for (const [k, v] of Object.entries(cur)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/tasks?${s}` : "/tasks";
  };
  const dropFilter = (key) => buildQs({ [key]: "" });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Delivery"
        title="Board"
        description="Every task moving through the lifecycle."
        actions={
          <div className="flex items-center gap-3 text-[12px] text-dim">
            <span>{stats.total} total</span>
            {stats.overdue > 0 && <span className="text-warn">{stats.overdue} overdue</span>}
          </div>
        }
      />

      {(activeFilters.length > 0 || canSeeAll) && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((f) => (
            <Link
              key={f.key}
              href={dropFilter(f.key)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12px] font-medium transition-colors hover:border-warn hover:text-warn"
            >
              {f.label}
              <Icon name="plus" size={11} strokeWidth={2.4} className="rotate-45" />
            </Link>
          ))}
          {activeFilters.length > 0 && (
            <Link href="/tasks" className="text-[12px] text-faint hover:text-text">
              Clear
            </Link>
          )}
          {!overdue && (
            <Link
              href={buildQs({ overdue: "1" })}
              className="ml-auto text-[12px] text-faint hover:text-warn"
            >
              Show overdue only
            </Link>
          )}
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState title="No tasks match">
          {activeFilters.length ? "Try clearing filters." : "Create a task to get started."}
        </EmptyState>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
          {TASK_STATUSES.map((s) => {
            const col = byStatus[s];
            return (
              <div key={s} className="flex w-[300px] shrink-0 flex-col">
                <div className="mb-2.5 flex items-center gap-2 px-1">
                  <StatusDot status={s} />
                  <span className="text-[12.5px] font-semibold">{STATUS_LABEL[s]}</span>
                  <span className="text-[12px] text-faint">{col.length}</span>
                  {s === "completed" && (
                    <Icon name="check" size={13} className="ml-auto text-faint" />
                  )}
                </div>
                <div
                  className={`flex flex-1 flex-col gap-2.5 rounded-[14px] border border-line/60 p-2 ${
                    s === "blocked" ? "bg-warn-bg/40" : "bg-surface-2/40"
                  }`}
                >
                  {col.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[12px] text-faint">Empty</p>
                  ) : (
                    col.map((t) => <TaskCard key={t.id} task={t} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

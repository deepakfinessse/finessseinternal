import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/access";
import { getTask, getProject } from "@/lib/pm-data";
import { listUsers } from "@/lib/data";
import { listAudit } from "@/lib/audit";
import { STATUS_LABEL, fmtDuration } from "@/lib/pm-constants";
import { Card, Badge, EmptyState, fmtDate, fmtDateTime, relTime } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  TaskStatusBadge,
  PriorityChip,
  OverdueTag,
  ApprovalChip,
  DivisionDot,
  taskCode,
} from "@/components/pm-ui";
import {
  LifecycleControls,
  TaskEditForm,
  ScheduleForm,
  AssignForm,
  UpdateThread,
  ClientVisibleToggle,
  DeleteTaskButton,
} from "../task-forms";

export const metadata = { title: "Task · Finessse" };

function TimeVsEstimate({ estimateMinutes, loggedHours, hasLogs }) {
  const actualMinutes = Math.round(loggedHours * 60);
  const diff = estimateMinutes && hasLogs ? actualMinutes - estimateMinutes : null;
  return (
    <div className="mb-3 grid grid-cols-2 gap-3">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-faint">Estimated</div>
        <div className="text-[20px] font-semibold tabular-nums">{fmtDuration(estimateMinutes)}</div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-faint">Actual</div>
        <div className="text-[20px] font-semibold tabular-nums">{hasLogs ? fmtDuration(actualMinutes) : "—"}</div>
        {diff !== null && (
          <div className={`text-[11.5px] ${diff > 0 ? "text-secondary" : "text-primary"}`}>
            {diff === 0 ? "On estimate" : diff > 0 ? `${fmtDuration(diff)} over` : `${fmtDuration(-diff)} under`}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function TaskDetailPage({ params }) {
  const { id } = await params;
  const user = await requireUser();

  const task = await getTask(user, id);
  if (!task) notFound();

  const canEdit = user.can("task:update");
  const canSchedule = user.can("task:schedule");
  const canAssign = user.can("task:assign");
  const canApprove = user.can("task:approve");
  const canDelete = user.can("task:delete");
  const canSeePeople = canEdit || canAssign;
  const isOwner =
    task.assignee?.id === user.id || task.collaborators.some((c) => c.id === user.id);
  // Notes & attachments: admins, plus the person the task is actually for.
  const canContribute = canEdit || isOwner;

  const [allPeople, project, activity] = await Promise.all([
    canSeePeople ? listUsers({ status: "active" }) : [],
    canSeePeople ? getProject(user, task.projectId) : null,
    user.can("audit:read")
      ? listAudit({ targetType: "task", targetId: id, limit: 40 })
      : [],
  ]);
  // Restrict to the project's assigned team — unless it has none yet, in
  // which case fall back to everyone so untriaged projects aren't a dead end.
  const people = project?.memberIds?.length
    ? allPeople.filter((u) => project.memberIds.includes(u.id))
    : allPeople;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/projects/${task.projectId}`}
          className="mono text-[11px] uppercase tracking-[0.1em] text-faint hover:text-text"
        >
          ← {task.project?.name || "Project"}
        </Link>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <h1 className="text-[21px] font-semibold tracking-[-0.02em]">{task.title}</h1>
          <span className="mono text-[11px] text-faint">{taskCode(task)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TaskStatusBadge status={task.status} />
          <PriorityChip priority={task.priority} />
          <ApprovalChip approval={task.approval} />
          <OverdueTag show={task.overdue && task.status !== "completed"} iso={task.endDate} />
          <Badge tone={task.clientVisible ? "accepted" : "neutral"}>
            {task.clientVisible ? "client-visible" : "internal"}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <DivisionDot division={task.division} />
            {task.divisionLabel}
          </span>
          <span>·</span>
          <span>
            {task.startDate ? `${fmtDate(task.startDate)} → ` : "due "}
            {fmtDate(task.endDate)}
          </span>
          {task.estimateMinutes ? <span>· est. {fmtDuration(task.estimateMinutes)}</span> : null}
          {task.revisionCount > 0 && <span>· {task.revisionCount} revision(s)</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Description">
            {task.description ? (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{task.description}</p>
            ) : (
              <p className="text-[13px] text-dim">No description.</p>
            )}
          </Card>

          {task.approval === "rejected" && task.approvalNote && (
            <Card title="Revisions requested">
              <p className="whitespace-pre-wrap text-sm">{task.approvalNote}</p>
            </Card>
          )}

          <details className="card group p-5" open>
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
                  Updates
                  <span className="ml-2 text-[12px] font-normal text-faint">{task.updates.length}</span>
                </h2>
                <p className="mt-1 text-[13px] text-dim">Messages and files, in one thread.</p>
              </div>
              <Icon name="chevronDown" size={16} className="mt-0.5 text-dim transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4">
              <UpdateThread
                taskId={task.id}
                updates={task.updates}
                meId={user.id}
                canRemoveAny={canEdit}
                canContribute={canContribute}
              />
            </div>
          </details>

          {task.blockers?.length > 0 && (
            // Starts open while a blocker is active — that's when it matters.
            <details className="card group p-5" open={!!task.blocker}>
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Blocker log</h2>
                  <p className="mt-1 text-[13px] text-dim">{task.blockers.length} raised</p>
                </div>
                <Icon name="chevronDown" size={16} className="mt-0.5 text-dim transition-transform group-open:rotate-180" />
              </summary>
              <ul className="mt-4 flex flex-col divide-y divide-gray/15">
                {[...task.blockers].reverse().map((b, i) => (
                  <li key={i} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-xs text-gray">
                      {b.kind === "client_side" ? "Client-side" : "Internal"} · {b.active ? "active" : "resolved"}
                    </p>
                    <p className="mt-1 text-sm">{b.description}</p>
                    <ul className="mt-2 flex flex-col gap-1.5 text-xs text-gray">
                      {b.log.map((l, j) => (
                        <li key={j}>
                          <span className="text-foreground">{fmtDateTime(l.at)}</span>
                          {" · "}
                          {l.by?.name || l.by?.email || "Someone"} — {l.note}
                        </li>
                      ))}
                    </ul>
                    {b.resolvedAt && (
                      <p className="mt-2 text-xs text-primary">Resolved {fmtDateTime(b.resolvedAt)}</p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {user.can("audit:read") && (
            <details className="card group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
                  Activity
                  <span className="ml-2 text-[12px] font-normal text-faint">{activity.length}</span>
                </h2>
                <Icon name="chevronDown" size={16} className="text-dim transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4">
              {activity.length === 0 ? (
                <p className="text-sm text-gray">No recorded activity.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-gray/15 text-sm">
                  {activity.map((a) => (
                    <li key={String(a._id)} className="flex justify-between py-1.5">
                      <span><code className="text-xs">{a.action}</code></span>
                      <span className="text-xs text-gray">{relTime(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              </div>
            </details>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Lifecycle" description={STATUS_LABEL[task.status]}>
            <LifecycleControls task={task} canApprove={canApprove} />
          </Card>

          {(canApprove || isOwner) && (
            <Card title="Time logged" description="Estimated time vs. hours the assignee reported when submitting for review.">
              <TimeVsEstimate estimateMinutes={task.estimateMinutes} loggedHours={task.totalLoggedHours} hasLogs={task.timeLogs.length > 0} />
              {task.timeLogs.length === 0 ? (
                <p className="text-sm text-gray">No hours logged yet.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2 border-t border-gray/15 pt-3 text-sm">
                    {task.timeLogs.map((l, i) => (
                      <li key={i}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{l.loggedBy?.name || l.loggedBy?.email || "Someone"}</span>
                          <span className="mono text-[13px] font-semibold tabular-nums">{l.hours}h</span>
                        </div>
                        <div className="text-xs text-gray">
                          {fmtDateTime(l.loggedAt)}
                          {l.note && ` · ${l.note}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}

          <Card title="People">
            <dl className="text-sm">
              <dt className="text-gray">Assignee (executor)</dt>
              <dd className="mb-2 font-semibold">
                {task.assignee?.name || task.assignee?.email || "Unassigned"}
              </dd>
              <dt className="text-gray">Collaborators (contributors)</dt>
              <dd>
                {task.collaborators.length
                  ? task.collaborators.map((c) => c.name || c.email).join(", ")
                  : "—"}
              </dd>
            </dl>
            {canAssign && (
              <div className="mt-3 border-t border-gray/15 pt-3">
                <AssignForm task={task} people={people} />
              </div>
            )}
          </Card>

          {canSchedule && (
            <Card title="Schedule" description="Admin-controlled dates.">
              <ScheduleForm task={task} />
            </Card>
          )}

          {canEdit && (
            <Card title="Edit task">
              <TaskEditForm task={task} people={people} />
              <div className="mt-3 border-t border-gray/15 pt-3">
                <ClientVisibleToggle task={task} />
              </div>
            </Card>
          )}

          {canDelete && (
            <Card title="Danger zone">
              <DeleteTaskButton id={task.id} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

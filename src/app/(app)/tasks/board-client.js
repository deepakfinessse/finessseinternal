"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TASK_STATUSES, STATUS_LABEL } from "@/lib/pm-constants";
import { moveTask } from "@/lib/actions/tasks";
import { AvatarStack, EmptyState } from "@/components/ui";
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

const EMPTY_HINT = {
  open: "Backlog is clear",
  in_progress: "Nothing being worked on",
  in_review: "Awaiting admin approval",
  blocked: "Nothing blocked",
  completed: "Nothing shipped yet",
};

function localLegal(from, to, canApprove) {
  if (from === to) return { ok: false };
  if (to === "blocked") return { ok: false, error: "Open the task to raise a blocker with a reason." };
  if (from === "blocked") return { ok: true };
  if (to === "completed")
    return canApprove ? { ok: true } : { ok: false, error: "Only an approver can complete a task." };
  if (from === "completed")
    return canApprove ? { ok: true } : { ok: false, error: "Only an approver can reopen a completed task." };
  const N = { open: ["in_progress"], in_progress: ["open", "in_review"], in_review: ["open", "in_progress"] };
  return (N[from] || []).includes(to)
    ? { ok: true }
    : { ok: false, error: `Can't move ${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}.` };
}

function groupTasks(tasks) {
  const g = Object.fromEntries(TASK_STATUSES.map((s) => [s, []]));
  for (const t of tasks) (g[t.status] || g.open).push(t);
  return g;
}

function TaskCard({ task, draggable, pending, dragging, onOpen, onDragStart, onDragEnd }) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart(task);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task.id)}
      className={`group rounded-[13px] border border-line bg-surface p-3.5 transition-all ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } hover:border-line-strong ${dragging ? "opacity-40" : ""} ${
        pending ? "animate-pulse opacity-70" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <DivisionLabel division={task.division} label={task.divisionLabel} />
        <span className="mono text-[10px] tracking-[0.06em] text-faint">{taskCode(task)}</span>
      </div>

      <h3 className="mt-2 line-clamp-2 text-[13.5px] font-semibold leading-snug tracking-[-0.01em]">
        {task.title}
      </h3>

      {task.project?.client && <p className="mt-1 text-[12px] text-dim">{task.project.client}</p>}

      {(task.blocker?.active ||
        task.priority === "high" ||
        task.priority === "urgent" ||
        task.approval === "pending" ||
        task.approval === "rejected") && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {task.blocker?.active && <BlockerChip blocker={task.blocker} />}
          <PriorityChip priority={task.priority} />
          <ApprovalChip approval={task.approval} />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {(task.assignee || task.collaborators.length > 0) && (
            <AvatarStack people={[task.assignee, ...task.collaborators].filter(Boolean)} size={20} />
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
    </div>
  );
}

export function BoardClient({ tasks, canApprove, canDrag }) {
  // The parent passes a `key` derived from the task set, so a server data change
  // remounts this component with fresh props — no effect-based resync needed.
  const router = useRouter();
  const [cols, setCols] = useState(() => groupTasks(tasks));
  const [drag, setDrag] = useState(null); // { id, from, task }
  const [over, setOver] = useState(null); // status
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [, startTransition] = useTransition();

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast((m) => (m === msg ? null : m)), 3500);
  };

  const openTask = (id) => router.push(`/tasks/${id}`);

  const handleDrop = async (toStatus) => {
    setOver(null);
    const d = drag;
    setDrag(null);
    if (!d || d.from === toStatus) return;

    const legal = localLegal(d.from, toStatus, canApprove);
    if (!legal.ok) {
      if (legal.error) flash(legal.error);
      return;
    }

    const prev = cols;
    const card = cols[d.from]?.find((t) => t.id === d.id);
    if (!card) return;
    setCols({
      ...cols,
      [d.from]: cols[d.from].filter((t) => t.id !== d.id),
      [toStatus]: [{ ...card, status: toStatus }, ...cols[toStatus]],
    });
    setPendingIds((s) => new Set(s).add(d.id));

    const fd = new FormData();
    fd.set("id", d.id);
    fd.set("to", toStatus);
    const res = await moveTask(null, fd);

    setPendingIds((s) => {
      const n = new Set(s);
      n.delete(d.id);
      return n;
    });
    if (res?.ok) {
      startTransition(() => router.refresh());
    } else {
      setCols(prev);
      flash(res?.error || "Couldn't move that task.");
    }
  };

  const total = TASK_STATUSES.reduce((n, s) => n + cols[s].length, 0);
  if (total === 0) {
    return <EmptyState title="No tasks match">Try clearing filters, or create a task.</EmptyState>;
  }

  return (
    <div className="relative">
      {toast && (
        <div className="animate-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[10px] border border-line-strong bg-surface px-4 py-2 text-[13px] text-text shadow-pop">
          {toast}
        </div>
      )}

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
        {TASK_STATUSES.map((s) => {
          const col = cols[s];
          const isOver = over === s && drag && drag.from !== s;
          const dropOk = isOver && localLegal(drag.from, s, canApprove).ok;
          return (
            <div key={s} className="flex w-[300px] shrink-0 flex-col">
              <div className="mb-2.5 flex items-center gap-2 px-1">
                <StatusDot status={s} />
                <span className="text-[12.5px] font-semibold">{STATUS_LABEL[s]}</span>
                <span className="text-[12px] text-faint">{col.length}</span>
                {s === "completed" && <Icon name="check" size={13} className="ml-auto text-faint" />}
              </div>
              <div
                onDragOver={(e) => {
                  if (!drag || !canDrag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== s) setOver(s);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget)) return;
                  setOver((o) => (o === s ? null : o));
                }}
                onDrop={() => handleDrop(s)}
                className={`flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-[14px] border p-2 transition-colors ${
                  isOver
                    ? dropOk
                      ? "border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
                      : "border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-warn-bg/40"
                    : s === "blocked"
                      ? "border-line/60 bg-warn-bg/30"
                      : "border-line/60 bg-surface-2/40"
                }`}
              >
                {col.length === 0 ? (
                  <p className="px-2 py-8 text-center text-[12px] text-faint">{EMPTY_HINT[s]}</p>
                ) : (
                  col.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      draggable={canDrag}
                      dragging={drag?.id === t.id}
                      pending={pendingIds.has(t.id)}
                      onOpen={openTask}
                      onDragStart={(task) => setDrag({ id: task.id, from: task.status, task })}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, Field, fmtDateTime, inputClass } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PRIORITIES, BLOCKER_KINDS, fmtDuration, MAX_UPDATE_WORDS, countWords } from "@/lib/pm-constants";
import {
  createTask,
  updateTask,
  scheduleTask,
  assignTask,
  addTaskUpdate,
  removeTaskUpdate,
  setTaskClientVisible,
  transitionTask,
  submitForReview,
  raiseBlocker,
  appendBlockerNote,
  resolveBlocker,
  submitForApproval,
  approveTask,
  rejectTask,
  reopenTask,
  deleteTask,
} from "@/lib/actions/tasks";

function toDateInput(iso) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

/** Hours + minutes pair, read server-side by readDuration(). */
function EstimateFields({ minutes, required = false, hint }) {
  const h = minutes ? Math.floor(minutes / 60) : "";
  const m = minutes ? minutes % 60 : "";
  return (
    <Field label="Estimated time" hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          name="estimateHours"
          min="0"
          max="999"
          step="1"
          defaultValue={h}
          placeholder="0"
          aria-label="Estimated hours"
          className={`${inputClass} w-20`}
          required={required}
        />
        <span className="text-[12px] text-dim">h</span>
        <input
          type="number"
          name="estimateMinutes"
          min="0"
          max="59"
          step="1"
          defaultValue={m}
          placeholder="0"
          aria-label="Estimated minutes"
          className={`${inputClass} w-20`}
        />
        <span className="text-[12px] text-dim">m</span>
      </div>
    </Field>
  );
}

/* ------------------------------------------------------------------ create */

export function CreateTaskForm({ projects, people, allDivisions = [], defaultProjectId, canSchedule, canAssign }) {
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || "");
  const project = projects.find((p) => p.id === projectId);
  const divisions = allDivisions.filter((d) => (project?.divisions || []).includes(d.key));
  // Restrict to the project's assigned team — unless it has none yet, in
  // which case fall back to everyone so untriaged projects aren't a dead end.
  const projectPeople = project?.memberIds?.length
    ? people.filter((u) => project.memberIds.includes(u.id))
    : people;

  return (
    <ActionForm action={createTask} successMessage="Task created." className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project">
          <select
            name="projectId"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputClass}
            required
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Division" hint="Limited to the project's divisions">
          <select name="division" className={inputClass} required>
            {divisions.length === 0 && <option value="">— project has no divisions —</option>}
            {divisions.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Title">
        <input name="title" className={inputClass} required />
      </Field>
      <Field label="Description">
        <textarea name="description" rows={3} className={inputClass} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Priority">
          <select name="priority" defaultValue="medium" className={inputClass}>
            {PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date" hint={canSchedule ? "" : "Admin-controlled"}>
          <input type="date" name="startDate" className={inputClass} disabled={!canSchedule} />
        </Field>
        <Field label="End date">
          <input type="date" name="endDate" className={inputClass} disabled={!canSchedule} />
        </Field>
      </div>

      <EstimateFields required hint="Approximate time — the assignee can't change it" />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Assignee (executor)"
          hint={project?.memberIds?.length ? "Limited to people assigned to this project" : ""}
        >
          <select name="assigneeId" className={inputClass} disabled={!canAssign} defaultValue="">
            <option value="">— unassigned —</option>
            {projectPeople.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Collaborators (contributors)" hint="Ctrl/Cmd-click for multiple">
          <select name="collaboratorIds" multiple className={`${inputClass} h-24`}>
            {projectPeople.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="clientVisible" />
        Client-side visible (vs. internal only)
      </label> */}

      <SubmitButton>Create task</SubmitButton>
    </ActionForm>
  );
}

/* ------------------------------------------------------------- edit fields */

export function TaskEditForm({ task, people }) {
  return (
    <ActionForm action={updateTask} hidden={{ id: task.id }} successMessage="Saved." className="flex flex-col gap-3">
      <Field label="Title">
        <input name="title" defaultValue={task.title} className={inputClass} required />
      </Field>
      <Field label="Description">
        <textarea name="description" rows={4} defaultValue={task.description} className={inputClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Priority">
          <select name="priority" defaultValue={task.priority} className={inputClass}>
            {PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Collaborators">
          <select
            name="collaboratorIds"
            multiple
            defaultValue={task.collaborators.map((c) => c.id)}
            className={`${inputClass} h-24`}
          >
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <SubmitButton>Save changes</SubmitButton>
    </ActionForm>
  );
}

export function ScheduleForm({ task }) {
  return (
    <ActionForm action={scheduleTask} hidden={{ id: task.id }} successMessage="Schedule updated." className="flex flex-wrap items-end gap-3">
      <Field label="Start date">
        <input type="date" name="startDate" defaultValue={toDateInput(task.startDate)} className={inputClass} />
      </Field>
      <Field label="End date">
        <input type="date" name="endDate" defaultValue={toDateInput(task.endDate)} className={inputClass} />
      </Field>
      <EstimateFields minutes={task.estimateMinutes} />
      <SubmitButton variant="secondary">Set schedule</SubmitButton>
    </ActionForm>
  );
}

export function AssignForm({ task, people }) {
  return (
    <ActionForm action={assignTask} hidden={{ id: task.id }} successMessage="Assignee updated." className="flex items-end gap-2">
      <Field label="Assignee">
        <select name="assigneeId" defaultValue={task.assignee?.id || ""} className={inputClass}>
          <option value="">— unassigned —</option>
          {people.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.email}
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton variant="secondary">Assign</SubmitButton>
    </ActionForm>
  );
}

/* ----------------------------------------------------------------- updates */

/**
 * Chat-style thread: your posts on the right, everyone else's on the left
 * with their avatar, the composer pinned underneath. Scrolls to the newest
 * post on load and whenever one is added.
 */
export function UpdateThread({ taskId, updates, meId, canRemoveAny, canContribute }) {
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [updates.length]);

  let prevBy = null;
  return (
    <div className="flex flex-col">
      <div className="max-h-[480px] space-y-2 overflow-y-auto rounded-[12px] bg-surface-2/40 p-3">
        {updates.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-faint">No updates yet — start the conversation.</p>
        ) : (
          updates.map((entry) => {
            const mine = entry.by?.id === meId;
            const sameAuthor = entry.by?.id === prevBy;
            prevBy = entry.by?.id;
            return (
              <UpdateBubble
                key={entry.id}
                entry={entry}
                mine={mine}
                showAuthor={!sameAuthor}
                canRemove={canRemoveAny || mine}
                taskId={taskId}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      {canContribute && (
        <div className="mt-3">
          <UpdateComposer taskId={taskId} />
        </div>
      )}
    </div>
  );
}

function UpdateBubble({ entry, mine, showAuthor, canRemove, taskId }) {
  const name = entry.by?.name || entry.by?.email || "Someone";
  return (
    <div className={`group/msg flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${showAuthor ? "pt-2" : ""}`}>
      {!mine && (
        <span className="w-7 shrink-0">
          {showAuthor && <Avatar name={entry.by?.name} email={entry.by?.email} src={entry.by?.image} size={28} />}
        </span>
      )}
      <div className={`flex max-w-[75%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {showAuthor && !mine && (
          <span className="mb-0.5 px-1 text-[10.5px] font-semibold text-faint">{name}</span>
        )}
        <div
          className={`rounded-[12px] px-3 py-2 text-[13px] leading-relaxed ${
            mine ? "rounded-br-[4px] bg-action text-action-text" : "rounded-bl-[4px] bg-surface text-text shadow-sm"
          }`}
        >
          {entry.text && <p className="whitespace-pre-wrap break-words">{entry.text}</p>}
          {entry.attachment && (
            <a
              href={entry.attachment.url}
              target="_blank"
              rel="noreferrer"
              className={`flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium hover:underline ${
                entry.text ? "mt-1.5" : ""
              } ${mine ? "bg-white/15" : "bg-surface-2"}`}
            >
              <Icon name={entry.attachment.type === "gdoc" ? "file" : "link"} size={14} className="shrink-0" />
              <span className="truncate">{entry.attachment.label}</span>
            </a>
          )}
        </div>
        <span className="mt-0.5 flex items-center gap-1.5 px-1 text-[9.5px] text-faint">
          {fmtDateTime(entry.at)}
          {canRemove && <RemoveUpdateButton taskId={taskId} updateId={entry.id} />}
        </span>
      </div>
    </div>
  );
}

/**
 * One composer, one submit — a message and an attached file/link go up
 * together as a single post. The attachment fields stay collapsed until
 * asked for, so the common case (just a message) reads as one input.
 * Enter sends, Shift+Enter adds a new line.
 */
export function UpdateComposer({ taskId }) {
  const [attaching, setAttaching] = useState(false);
  // Controlled so a failed post keeps the draft (React resets uncontrolled
  // fields after every form action) and so the word counter stays in sync.
  const [text, setText] = useState("");
  const words = countWords(text);
  const overLimit = words > MAX_UPDATE_WORDS;
  return (
    <ActionForm
      action={addTaskUpdate}
      hidden={{ id: taskId }}
      className="flex flex-col gap-2"
      onDone={() => {
        setAttaching(false);
        setText("");
      }}
    >
      {attaching && (
        <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-line bg-surface-2/40 p-2.5">
          <Field label="Type">
            <select name="attachType" defaultValue="gdoc" className={inputClass}>
              <option value="gdoc">Google Docs link</option>
              <option value="file">File URL</option>
            </select>
          </Field>
          <Field label="Label">
            <input name="attachLabel" className={inputClass} placeholder="What is it?" />
          </Field>
          <Field label="URL">
            <input name="attachUrl" type="url" className={inputClass} placeholder="https://…" />
          </Field>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setAttaching((a) => !a)}
          title={attaching ? "Remove attachment" : "Attach a file or link"}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line-strong transition-colors hover:bg-surface-2 hover:text-text ${
            attaching ? "bg-surface-2 text-text" : "text-dim"
          }`}
        >
          <Icon name={attaching ? "close" : "paperclip"} size={16} />
        </button>
        <textarea
          name="text"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!overLimit) e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Write a message…"
          aria-invalid={overLimit}
          className="max-h-32 min-h-9 flex-1 resize-none rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none placeholder:text-faint focus:border-line"
        />
        <SendButton disabled={overLimit} />
      </div>
      {words > 0 && (
        <span className={`text-right text-[11px] tabular-nums ${overLimit ? "text-secondary" : "text-faint"}`}>
          {words}/{MAX_UPDATE_WORDS} words{overLimit ? " — too long" : ""}
        </span>
      )}
    </ActionForm>
  );
}

function SendButton({ disabled }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="flex h-9 shrink-0 items-center justify-center rounded-[10px] bg-action px-3.5 text-[13px] font-semibold text-action-text transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

function RemoveSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-faint opacity-0 transition-opacity hover:text-secondary focus:opacity-100 group-hover/msg:opacity-100 pointer-coarse:opacity-100 disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}

export function RemoveUpdateButton({ taskId, updateId }) {
  return (
    <ActionForm action={removeTaskUpdate} hidden={{ id: taskId, updateId }} className="inline">
      <RemoveSubmit />
    </ActionForm>
  );
}

export function ClientVisibleToggle({ task }) {
  return (
    <ActionForm
      action={setTaskClientVisible}
      hidden={{ id: task.id, clientVisible: String(!task.clientVisible) }}
    >
      <SubmitButton variant="ghost">
        {task.clientVisible ? "Make internal-only" : "Make client-visible"}
      </SubmitButton>
    </ActionForm>
  );
}

export function DeleteTaskButton({ id }) {
  return (
    <ActionForm action={deleteTask} hidden={{ id }}>
      <SubmitButton variant="danger">Delete task</SubmitButton>
    </ActionForm>
  );
}

/* ------------------------------------------------------- lifecycle controls */

/**
 * Submitting for review requires logging hours spent — a popup collects them
 * so managers/admins get real time-on-task, not just lifecycle timestamps.
 */
function SubmitForReviewButton({ taskId, estimateMinutes }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        Submit for review
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[14px] border border-line-strong bg-surface p-5 shadow-pop">
            <h3 className="text-[15px] font-semibold">Log your hours</h3>
            <p className="mt-1 text-[13px] text-dim">
              How long did you spend on this task before it goes to review?
            </p>
            {estimateMinutes ? (
              <p className="mt-2 text-[12.5px] text-dim">
                Estimated time: <span className="font-semibold text-text">{fmtDuration(estimateMinutes)}</span>
              </p>
            ) : null}
            <ActionForm
              action={submitForReview}
              hidden={{ id: taskId }}
              onDone={() => setOpen(false)}
              className="mt-4 flex flex-col gap-3"
            >
              <Field label="Hours spent">
                <input
                  name="hours"
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  className={inputClass}
                  required
                  autoFocus
                />
              </Field>
              <Field label="Note (optional)">
                <input name="note" className={inputClass} placeholder="What did you work on?" />
              </Field>
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3.5 py-2 text-sm text-dim hover:text-text"
                >
                  Cancel
                </button>
                <SubmitButton>Submit for review</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}

export function LifecycleControls({ task, canApprove }) {
  const s = task.status;

  return (
    <div className="flex flex-col gap-4">
      {/* Normal forward moves */}
      {s === "open" && (
        <ActionForm action={transitionTask} hidden={{ id: task.id, to: "in_progress" }}>
          <SubmitButton>Start work</SubmitButton>
        </ActionForm>
      )}

      {s === "in_progress" && (
        <div className="flex flex-wrap gap-2">
          <SubmitForReviewButton taskId={task.id} estimateMinutes={task.estimateMinutes} />
        </div>
      )}

      {s === "in_review" && (
        <div className="flex flex-wrap gap-2">
          <ActionForm action={submitForApproval} hidden={{ id: task.id }}>
            <SubmitButton>Request admin approval</SubmitButton>
          </ActionForm>
          <ActionForm action={transitionTask} hidden={{ id: task.id, to: "in_progress" }}>
            <SubmitButton variant="ghost">Reopen for changes</SubmitButton>
          </ActionForm>
        </div>
      )}

      {/* Blocker */}
      {s !== "blocked" && s !== "completed" && (
        <details className="rounded-lg border border-secondary/30 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-secondary">
            Raise a blocker
          </summary>
          <ActionForm action={raiseBlocker} hidden={{ id: task.id }} className="mt-3 flex flex-col gap-2">
            <select name="kind" defaultValue="internal" className={inputClass}>
              {BLOCKER_KINDS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
            <textarea name="description" rows={2} placeholder="What's blocking this task?" className={inputClass} required />
            <SubmitButton variant="danger">Raise blocker</SubmitButton>
          </ActionForm>
        </details>
      )}

      {s === "blocked" && (
        <div className="rounded-lg border border-secondary/40 bg-secondary/10 p-3">
          <p className="text-sm font-semibold text-secondary">
            Blocked ({task.blocker?.kind === "client_side" ? "client-side" : "internal"})
          </p>
          <p className="mt-1 text-sm">{task.blocker?.description}</p>

          <ActionForm action={appendBlockerNote} hidden={{ id: task.id }} className="mt-3 flex gap-2">
            <input name="note" placeholder="Add to the blocker log…" className={inputClass} />
            <SubmitButton variant="ghost">Log</SubmitButton>
          </ActionForm>

          <ActionForm action={resolveBlocker} hidden={{ id: task.id }} className="mt-2 flex gap-2">
            <input name="note" placeholder="Resolution note (optional)" className={inputClass} />
            <SubmitButton>Resolve blocker</SubmitButton>
          </ActionForm>
        </div>
      )}

      {/* Approval gateway */}
      {canApprove && task.approval === "pending" && (
        <div className="rounded-lg border border-primary/30 p-3">
          <p className="mb-2 text-sm font-semibold">Admin approval</p>
          <ActionForm action={approveTask} hidden={{ id: task.id }} className="flex flex-col gap-2">
            <input name="note" placeholder="Approval note (optional)" className={inputClass} />
            <SubmitButton>Approve &amp; complete</SubmitButton>
          </ActionForm>
          <ActionForm action={rejectTask} hidden={{ id: task.id }} className="mt-2 flex flex-col gap-2">
            <input name="note" placeholder="Revisions required…" className={inputClass} required />
            <SubmitButton variant="danger">Reject / request revisions</SubmitButton>
          </ActionForm>
        </div>
      )}

      {canApprove && s === "completed" && (
        <ActionForm action={reopenTask} hidden={{ id: task.id }}>
          <SubmitButton variant="ghost">Reopen task</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

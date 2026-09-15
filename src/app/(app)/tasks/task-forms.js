"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { PRIORITIES, BLOCKER_KINDS } from "@/lib/pm-constants";
import {
  createTask,
  updateTask,
  scheduleTask,
  assignTask,
  addAttachment,
  removeAttachment,
  setTaskClientVisible,
  transitionTask,
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

/* ------------------------------------------------------------------ create */

export function CreateTaskForm({ projects, people, allDivisions = [], defaultProjectId, canSchedule, canAssign }) {
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || "");
  const project = projects.find((p) => p.id === projectId);
  const divisions = allDivisions.filter((d) => (project?.divisions || []).includes(d.key));

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

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Assignee (executor)">
          <select name="assigneeId" className={inputClass} disabled={!canAssign} defaultValue="">
            <option value="">— unassigned —</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Collaborators (contributors)" hint="Ctrl/Cmd-click for multiple">
          <select name="collaboratorIds" multiple className={`${inputClass} h-24`}>
            {people.map((u) => (
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
    <ActionForm action={scheduleTask} hidden={{ id: task.id }} successMessage="Dates updated." className="flex flex-wrap items-end gap-3">
      <Field label="Start date">
        <input type="date" name="startDate" defaultValue={toDateInput(task.startDate)} className={inputClass} />
      </Field>
      <Field label="End date">
        <input type="date" name="endDate" defaultValue={toDateInput(task.endDate)} className={inputClass} />
      </Field>
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

/* --------------------------------------------------------------- attachments */

export function AttachmentForm({ taskId }) {
  return (
    <ActionForm action={addAttachment} hidden={{ id: taskId }} successMessage="Attachment added." className="flex flex-wrap items-end gap-2">
      <Field label="Type">
        <select name="type" defaultValue="gdoc" className={inputClass}>
          <option value="gdoc">Google Docs link</option>
          <option value="file">File URL</option>
        </select>
      </Field>
      <Field label="Label">
        <input name="label" className={inputClass} required />
      </Field>
      <Field label="URL">
        <input name="url" type="url" className={inputClass} required placeholder="https://…" />
      </Field>
      <SubmitButton variant="secondary">Add</SubmitButton>
    </ActionForm>
  );
}

export function RemoveAttachmentButton({ taskId, attId }) {
  return (
    <ActionForm action={removeAttachment} hidden={{ id: taskId, attId }}>
      <SubmitButton variant="ghost">Remove</SubmitButton>
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
          <ActionForm action={transitionTask} hidden={{ id: task.id, to: "in_review" }}>
            <SubmitButton>Submit for review</SubmitButton>
          </ActionForm>
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

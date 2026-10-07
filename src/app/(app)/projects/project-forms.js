"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { PROJECT_STATUSES } from "@/lib/pm-constants";
import {
  createProject,
  updateProject,
  setProjectStatus,
  deleteProject,
} from "@/lib/actions/projects";

function TeamPicker({ teams = [], selected = [] }) {
  return (
    <Field label="Teams" hint="Select the team(s) working on this project — their members can be assigned tasks.">
      <div className="flex flex-wrap gap-2">
        {teams.length === 0 && <span className="text-sm text-gray">No teams configured yet.</span>}
        {teams.map((t) => (
          <label
            key={t.id}
            className="flex items-center gap-1.5 rounded-lg border border-gray/25 px-2.5 py-1 text-sm"
          >
            <input
              type="checkbox"
              name="teamIds"
              value={t.id}
              defaultChecked={selected.includes(t.id)}
            />
            {t.name}
          </label>
        ))}
      </div>
    </Field>
  );
}

export function ProjectForm({ project, teams = [] }) {
  const editing = !!project;
  return (
    <ActionForm
      action={editing ? updateProject : createProject}
      hidden={editing ? { id: project.id } : {}}
      successMessage={editing ? "Project saved." : "Project onboarded."}
      className="flex flex-col gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project name">
          <input name="name" defaultValue={project?.name || ""} className={inputClass} required />
        </Field>
        <Field label="Client">
          <input name="client" defaultValue={project?.client || ""} className={inputClass} />
        </Field>
      </div>
      {editing && (
        <Field label="Project number" hint="Generated automatically, cannot be changed.">
          <input value={project.projectNumber} className={inputClass} disabled />
        </Field>
      )}
      <Field label="Description">
        <textarea name="description" rows={3} defaultValue={project?.description || ""} className={inputClass} />
      </Field>
      <TeamPicker teams={teams} selected={project?.teamIds || []} />
      <SubmitButton>{editing ? "Save project" : "Onboard project"}</SubmitButton>
    </ActionForm>
  );
}

export function ProjectStatusForm({ project }) {
  return (
    <ActionForm action={setProjectStatus} hidden={{ id: project.id }} className="flex flex-wrap items-end gap-2">
      <Field label="Lifecycle status">
        <select name="status" defaultValue={project.status} className={inputClass}>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton variant="secondary">Update status</SubmitButton>
    </ActionForm>
  );
}

export function DeleteProjectButton({ id }) {
  return (
    <ActionForm action={deleteProject} hidden={{ id }}>
      <SubmitButton variant="danger">Delete project</SubmitButton>
    </ActionForm>
  );
}

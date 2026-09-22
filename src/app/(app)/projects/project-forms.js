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

function DivisionPicker({ divisions = [], selected = [] }) {
  return (
    <Field label="Divisions" hint="Select the divisions this project is assigned to.">
      <div className="flex flex-wrap gap-2">
        {divisions.length === 0 && <span className="text-sm text-gray">No divisions configured yet.</span>}
        {divisions.map((d) => (
          <label
            key={d.key}
            className="flex items-center gap-1.5 rounded-lg border border-gray/25 px-2.5 py-1 text-sm"
          >
            <input
              type="checkbox"
              name="divisions"
              value={d.key}
              defaultChecked={selected.includes(d.key)}
            />
            {d.label}
          </label>
        ))}
      </div>
    </Field>
  );
}

function PeoplePicker({ people = [], selected = [] }) {
  return (
    <Field label="Assign people" hint="Selected people are notified by email and in-app.">
      <div className="flex flex-wrap gap-2">
        {people.length === 0 && <span className="text-sm text-gray">No people available.</span>}
        {people.map((u) => (
          <label
            key={u.id}
            className="flex items-center gap-1.5 rounded-lg border border-gray/25 px-2.5 py-1 text-sm"
          >
            <input
              type="checkbox"
              name="memberIds"
              value={u.id}
              defaultChecked={selected.includes(u.id)}
            />
            {u.name || u.email}
          </label>
        ))}
      </div>
    </Field>
  );
}

export function ProjectForm({ project, divisions = [], people = [] }) {
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
      <DivisionPicker divisions={divisions} selected={project?.divisions || []} />
      <PeoplePicker people={people} selected={project?.memberIds || []} />
      {/* <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="clientVisible" defaultChecked={project?.clientVisible} />
        Visible to client
      </label> */}
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

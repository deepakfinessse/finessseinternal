"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { updateProfile, setUserStatus, deleteUser } from "@/lib/actions/team";
import { assignRoles } from "@/lib/actions/roles";
import { assignVersion } from "@/lib/actions/versions";

export function ProfileEditForm({ person, canEdit }) {
  return (
    <ActionForm
      action={updateProfile}
      hidden={{ userId: person.id }}
      successMessage="Profile saved."
      className="flex flex-col gap-3"
    >
      <fieldset disabled={!canEdit} className="flex flex-col gap-3 disabled:opacity-60">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <input name="name" defaultValue={person.name} className={inputClass} required />
          </Field>
          <Field label="Title / role">
            <input name="title" defaultValue={person.title} className={inputClass} />
          </Field>
          <Field label="Phone">
            <input name="phone" defaultValue={person.phone} className={inputClass} />
          </Field>
          <Field label="Timezone" hint="e.g. Asia/Kolkata">
            <input name="timezone" defaultValue={person.timezone} className={inputClass} />
          </Field>
        </div>
        <Field label="Skill tags" hint="Comma-separated">
          <input
            name="skills"
            defaultValue={person.skills.join(", ")}
            className={inputClass}
            placeholder="react, project-management, qa"
          />
        </Field>
        {canEdit && <SubmitButton>Save profile</SubmitButton>}
      </fieldset>
    </ActionForm>
  );
}

export function RoleAssignForm({ person, roles, canAssign }) {
  return (
    <ActionForm
      action={assignRoles}
      hidden={{ userId: person.id }}
      successMessage="Roles updated."
      className="flex flex-col gap-3"
    >
      <fieldset disabled={!canAssign} className="flex flex-col gap-2 disabled:opacity-60">
        {roles.map((r) => (
          <label key={r.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="roleIds"
              value={r.id}
              defaultChecked={person.roleIds.includes(r.id)}
              className="mt-1"
            />
            <span>
              <span className="font-semibold">{r.name}</span>
              {r.isSystem && <span className="ml-1 text-xs text-gray">system</span>}
              <span className="block text-xs text-gray">{r.description || r.key}</span>
            </span>
          </label>
        ))}
        {canAssign && <SubmitButton>Update roles</SubmitButton>}
      </fieldset>
    </ActionForm>
  );
}

export function VersionAssignForm({ person, versions, canAssign }) {
  return (
    <ActionForm
      action={assignVersion}
      hidden={{ userId: person.id }}
      successMessage="Version allocated."
      className="flex items-end gap-2"
    >
      <Field label="Allocated release version">
        <select
          name="version"
          defaultValue={person.assignedVersion || ""}
          disabled={!canAssign}
          className={inputClass}
        >
          <option value="">— none —</option>
          {versions
            .filter((v) => v.isActive || v.version === person.assignedVersion)
            .map((v) => (
              <option key={v.id} value={v.version}>
                {v.version} ({v.channel})
              </option>
            ))}
        </select>
      </Field>
      {canAssign && <SubmitButton variant="secondary">Allocate</SubmitButton>}
    </ActionForm>
  );
}

export function StatusForm({ person, canSuspend, canDelete }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {["active", "suspended", "deactivated"].map((s) => (
          <ActionForm key={s} action={setUserStatus} hidden={{ userId: person.id, status: s }}>
            <SubmitButton
              variant={s === "active" ? "primary" : "secondary"}
              className={person.status === s ? "ring-2 ring-primary" : ""}
            >
              Set {s}
            </SubmitButton>
          </ActionForm>
        ))}
      </div>
      {!canSuspend && (
        <p className="text-xs text-gray">You don&apos;t have permission to change status.</p>
      )}
      {canDelete && (
        <ActionForm
          action={deleteUser}
          hidden={{ userId: person.id }}
          className="border-t border-gray/15 pt-3"
        >
          <SubmitButton variant="danger">Delete assignee permanently</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

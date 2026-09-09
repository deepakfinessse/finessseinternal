"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { createVersion, updateVersion, deleteVersion } from "@/lib/actions/versions";

const CHANNELS = ["stable", "beta", "canary", "lts"];

export function NewVersionForm() {
  return (
    <ActionForm action={createVersion} successMessage="Version added." className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Version" hint="e.g. 2.4.0">
          <input name="version" className={inputClass} required />
        </Field>
        <Field label="Channel">
          <select name="channel" className={inputClass} defaultValue="stable">
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end gap-4 pb-2 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="isActive" defaultChecked /> Active
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="isDefault" /> Default
          </label>
        </div>
      </div>
      <Field label="Release notes">
        <textarea name="notes" rows={2} className={inputClass} />
      </Field>
      <SubmitButton>Add version</SubmitButton>
    </ActionForm>
  );
}

export function VersionRowForm({ v }) {
  return (
    <ActionForm action={updateVersion} hidden={{ id: v.id }} className="flex flex-wrap items-center gap-3">
      <select name="channel" defaultValue={v.channel} className="rounded-lg border border-gray/30 bg-background px-2 py-1 text-xs">
        {CHANNELS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="isActive" defaultChecked={v.isActive} /> active
      </label>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="isDefault" defaultChecked={v.isDefault} /> default
      </label>
      <SubmitButton variant="secondary">Save</SubmitButton>
    </ActionForm>
  );
}

export function DeleteVersionForm({ id, disabled }) {
  return (
    <ActionForm action={deleteVersion} hidden={{ id }}>
      <SubmitButton variant="ghost" className={disabled ? "pointer-events-none opacity-40" : ""}>
        Delete
      </SubmitButton>
    </ActionForm>
  );
}

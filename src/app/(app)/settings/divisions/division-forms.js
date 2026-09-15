"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { createDivision, updateDivision, deleteDivision } from "@/lib/actions/divisions";

export function NewDivisionForm() {
  return (
    <ActionForm action={createDivision} successMessage="Division added." className="flex items-end gap-3">
      <Field label="Division name" >
        <input name="label" className={inputClass} required minLength={2} maxLength={60} />
      </Field>
      <SubmitButton>Add division</SubmitButton>
    </ActionForm>
  );
}

export function DivisionRowForm({ division }) {
  return (
    <ActionForm action={updateDivision} hidden={{ id: division.id }} className="flex items-center gap-2">
      <input
        name="label"
        defaultValue={division.label}
        className={`${inputClass} w-56`}
        required
        minLength={2}
        maxLength={60}
      />
      <SubmitButton variant="secondary">Save</SubmitButton>
    </ActionForm>
  );
}

export function DeleteDivisionForm({ id }) {
  return (
    <ActionForm action={deleteDivision} hidden={{ id }}>
      <SubmitButton variant="ghost">Delete</SubmitButton>
    </ActionForm>
  );
}

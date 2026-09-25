"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { completeMyProfile } from "@/lib/actions/team";

export function CompleteProfileForm({ defaults, email }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={completeMyProfile} className="flex flex-col gap-3">
      <Field label="Email">
        <input value={email} disabled className={`${inputClass} opacity-70`} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name *">
          <input name="name" defaultValue={defaults.name} className={inputClass} required autoFocus />
        </Field>
        <Field label="Title" hint="Shown as Executive if left blank">
          <input name="title" defaultValue={defaults.title} className={inputClass} />
        </Field>
        <Field label="Phone *">
          <input
            name="phone"
            type="tel"
            defaultValue={defaults.phone}
            placeholder="+91 98765 43210"
            className={inputClass}
            required
          />
        </Field>
        <Field label="Date of birth *">
          <input
            name="dateOfBirth"
            type="date"
            defaultValue={defaults.dateOfBirth}
            max={today}
            className={inputClass}
            required
          />
        </Field>
      </div>
      <SubmitButton className="mt-1">Save and continue</SubmitButton>
    </ActionForm>
  );
}

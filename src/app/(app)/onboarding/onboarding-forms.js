"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import {
  createInvitation,
  resendInvitation,
  revokeInvitation,
} from "@/lib/actions/onboarding";

export function InviteForm({ roles, workspaceDomain }) {
  const [lastLink, setLastLink] = useState(null);

  return (
    <ActionForm
      action={createInvitation}
      className="flex flex-col gap-3"
      onDone={(s) => setLastLink(s.link || null)}
      successMessage={(s) =>
        s.emailDelivered
          ? `Invitation emailed to ${s.link ? "" : ""}the address.`
          : "Invitation created. SMTP is not configured, so share the link below manually."
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Work email" hint={`Must be @${workspaceDomain}`}>
          <input
            name="email"
            type="email"
            required
            placeholder={`person@${workspaceDomain}`}
            className={inputClass}
          />
        </Field>
        <Field label="Title (optional)">
          <input name="title" className={inputClass} placeholder="Project Manager" />
        </Field>
      </div>
      <Field label="Roles" hint="Pick at least one">
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-1.5 rounded-lg border border-gray/25 px-2.5 py-1 text-sm"
            >
              <input
                type="checkbox"
                name="roleIds"
                value={r.id}
                defaultChecked={r.key === "assignee"}
              />
              {r.name}
            </label>
          ))}
        </div>
      </Field>
      <SubmitButton>Send invitation</SubmitButton>

      {lastLink && (
        <div className="rounded-lg border border-gray/25 bg-gray/5 p-3 text-sm">
          <div className="mb-1 font-semibold">Invitation link</div>
          <code className="block break-all text-xs">{lastLink}</code>
        </div>
      )}
    </ActionForm>
  );
}

export function ResendButton({ id }) {
  return (
    <ActionForm action={resendInvitation} hidden={{ id }}>
      <SubmitButton variant="secondary">Resend</SubmitButton>
    </ActionForm>
  );
}

export function RevokeButton({ id }) {
  return (
    <ActionForm action={revokeInvitation} hidden={{ id }}>
      <SubmitButton variant="ghost">Revoke</SubmitButton>
    </ActionForm>
  );
}

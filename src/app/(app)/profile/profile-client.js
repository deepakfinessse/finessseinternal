"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass, Badge, relTime } from "@/components/ui";
import { updateProfile } from "@/lib/actions/team";
import { revokeSession, revokeAllOtherSessions } from "@/lib/actions/sessions";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function MyProfileForm({ me }) {
  return (
    <ActionForm
      action={updateProfile}
      hidden={{ userId: me.id }}
      successMessage="Saved."
      className="flex flex-col gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <input name="name" defaultValue={me.name} className={inputClass} required />
        </Field>
        <Field label="Title">
          <input name="title" defaultValue={me.title} className={inputClass} />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={me.phone} className={inputClass} />
        </Field>
        <Field label="Date of birth">
          <input type="date" name="dateOfBirth" defaultValue={me.dateOfBirth} max={todayInput()} className={inputClass} />
        </Field>
      </div>
      <SubmitButton>Save profile</SubmitButton>
    </ActionForm>
  );
}

export function MySessionList({ sessions, currentToken }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-gray/15 text-sm">
        {sessions.map((s) => {
          const isCurrent = s.sessionToken === currentToken;
          return (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <div className="font-semibold">
                  {s.device} {isCurrent && <span className="text-xs text-primary">(this device)</span>}
                </div>
                <div className="text-xs text-gray">
                  {s.ip || "no ip"} · app v{s.appVersion || "?"} · seen {relTime(s.lastSeenAt)}
                </div>
              </div>
              {isCurrent ? (
                <Badge tone="active">current</Badge>
              ) : (
                <ActionForm action={revokeSession} hidden={{ id: s.id }}>
                  <SubmitButton variant="ghost">Revoke</SubmitButton>
                </ActionForm>
              )}
            </li>
          );
        })}
      </ul>
      {sessions.length > 1 && (
        <ActionForm action={revokeAllOtherSessions} hidden={{ userId: "" }}>
          <SubmitButton variant="secondary">Sign out all other devices</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

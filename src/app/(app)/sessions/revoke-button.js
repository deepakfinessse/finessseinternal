"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { revokeSession } from "@/lib/actions/sessions";

export function RevokeSessionButton({ id }) {
  return (
    <ActionForm action={revokeSession} hidden={{ id }}>
      <SubmitButton variant="ghost">Revoke</SubmitButton>
    </ActionForm>
  );
}

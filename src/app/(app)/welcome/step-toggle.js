"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { completeOnboardingStep } from "@/lib/actions/onboarding";

export function StepToggle({ stepKey, done }) {
  if (done) {
    return (
      <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
        Done
      </span>
    );
  }
  return (
    <ActionForm action={completeOnboardingStep} hidden={{ step: stepKey }}>
      <SubmitButton variant="secondary">Mark done</SubmitButton>
    </ActionForm>
  );
}

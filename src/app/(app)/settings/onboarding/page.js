import { requirePermission } from "@/lib/access";
import { getOnboardingConfig } from "@/lib/data";
import { Card } from "@/components/ui";
import { StepsEditor } from "./steps-editor";

export const metadata = { title: "Onboarding steps · Finessse" };

export default async function OnboardingSettingsPage() {
  await requirePermission("onboarding:manage");
  const { steps } = await getOnboardingConfig();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">Onboarding checklist</h1>
        <p className="text-sm text-gray">
          The guided steps every new assignee sees on their welcome screen. &ldquo;Auto&rdquo;
          steps are marked complete by the system.
        </p>
      </div>
      <Card>
        <StepsEditor initialSteps={steps} />
      </Card>
    </div>
  );
}

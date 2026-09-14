import Link from "next/link";
import { requireUser } from "@/lib/access";
import { getOnboardingConfig } from "@/lib/data";
import { Card } from "@/components/ui";
import { StepToggle } from "./step-toggle";

export const metadata = { title: "Welcome · Finessse" };

export default async function WelcomePage() {
  const user = await requireUser();
  const { steps } = await getOnboardingConfig();
  const done = new Set(user.onboarding?.stepsCompleted || []);
  const remaining = steps.filter((s) => !s.auto && !done.has(s.key)).length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">Welcome to Finessse, {user.name || user.email}</h1>
        <p className="text-sm text-gray">
          {remaining === 0
            ? "You're all set. "
            : `${remaining} step${remaining === 1 ? "" : "s"} left. `}
          <Link href="/dashboard" className="text-primary">
            Go to the dashboard →
          </Link>
        </p>
      </div>

      <Card title="Your onboarding checklist">
        <ol className="flex flex-col divide-y divide-gray/15">
          {steps.map((s) => {
            const isDone = done.has(s.key) || s.auto;
            return (
              <li key={s.key} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <div className="font-semibold">
                    {s.title}
                    {s.auto && <span className="ml-2 text-xs text-gray">automatic</span>}
                  </div>
                  {s.description && (
                    <p className="text-sm text-gray">{s.description}</p>
                  )}
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary"
                    >
                      Open resource →
                    </a>
                  )}
                </div>
                <StepToggle stepKey={s.key} done={isDone} />
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="flex gap-2 text-sm">
        <Link href="/profile" className="rounded-lg border border-gray/30 px-3 py-2 font-semibold hover:border-primary">
          Complete my profile
        </Link>
        {/* <Link href="/sessions" className="rounded-lg border border-gray/30 px-3 py-2 font-semibold hover:border-primary">
          Review my devices
        </Link> */}
      </div>
    </div>
  );
}

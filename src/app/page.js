import { redirect } from "next/navigation";
import { getCurrentUser, needsProfileSetup } from "@/lib/access";

export default async function Index() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (user.status !== "active") redirect("/suspended");
  if (needsProfileSetup(user)) redirect("/complete-profile");

  const steps = user.onboarding?.stepsCompleted || [];
  if (!user.onboarding?.completedAt && !steps.includes("welcome") && !user.can("*")) {
    redirect("/welcome");
  }
  redirect("/dashboard");
}

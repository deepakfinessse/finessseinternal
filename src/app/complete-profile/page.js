import { redirect } from "next/navigation";
import { requireUser, needsProfileSetup } from "@/lib/access";
import { signOut } from "@/auth";
import { Logo } from "@/components/logo";
import { CompleteProfileForm } from "./complete-profile-form";

export const metadata = { title: "Complete your profile · Finessse" };

// Lives outside the (app) group on purpose: that layout redirects here until
// the profile is done, so rendering this inside it would loop.
export default async function CompleteProfilePage() {
  const user = await requireUser();
  if (!needsProfileSetup(user)) redirect("/");

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6">
          <div className="mono mb-1.5 text-[10px] uppercase tracking-[0.13em] text-faint">Step 1 · Your profile</div>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Complete your profile</h1>
          <p className="mt-1 text-[13px] text-dim">
            Before you get started, tell us a bit about yourself. Fields marked * are required.
          </p>
          <div className="mt-5">
            <CompleteProfileForm
              defaults={{
                name: user.name || "",
                title: user.title || "",
                phone: user.phone || "",
                dateOfBirth: user.dateOfBirth || "",
              }}
              email={user.email}
            />
          </div>
        </div>
        <form
          className="mt-4 text-center"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button type="submit" className="text-[12.5px] text-faint hover:text-text">
            Not you? Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

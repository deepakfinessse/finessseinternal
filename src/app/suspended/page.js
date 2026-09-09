import { signOut } from "@/auth";

export const metadata = { title: "Account inactive · Finessse" };

export default function SuspendedPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
      <h1 className="text-3xl font-heading">Account inactive</h1>
      <p className="max-w-sm text-sm text-gray">
        Your Finessse account is currently suspended or deactivated. Contact a workspace
        administrator to restore access.
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button
          type="submit"
          className="mt-2 rounded-lg border border-gray/30 px-4 py-2 text-sm font-semibold hover:border-primary"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

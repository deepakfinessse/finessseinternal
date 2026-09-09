import { redirect } from "next/navigation";
import { auth, signIn, WORKSPACE_DOMAIN } from "@/auth";

export const metadata = {
  title: "Sign in · Finessse",
};

export default async function SignInPage({ searchParams }) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray/25 bg-background p-8 shadow-sm">
        <h1 className="text-2xl font-heading">Sign in to Finessse</h1>
        <p className="mt-2 text-sm text-gray">
          Use your <span className="font-semibold">@{WORKSPACE_DOMAIN}</span>{" "}
          Google Workspace account.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-secondary/40 bg-secondary/10 px-3 py-2 text-sm">
            That account can&apos;t access Finessse. Sign in with your{" "}
            {WORKSPACE_DOMAIN} account.
          </p>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-primary px-4 py-2.5 font-semibold text-white transition-opacity hover:opacity-90"
          >
            <GoogleGlyph />
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

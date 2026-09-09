import { signIn, WORKSPACE_DOMAIN } from "@/auth";
import { getInvitationByToken } from "@/lib/data";

export const metadata = { title: "Accept invitation · Finessse" };

export default async function JoinPage({ params }) {
  const { token } = await params;
  const invite = await getInvitationByToken(token).catch(() => null);

  const bad =
    !invite ||
    invite.status === "revoked" ||
    (invite.status === "pending" && invite.expired);

  return (
    <div className="flex flex-1 items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-gray/25 bg-background p-8 shadow-sm">
        <h1 className="text-2xl font-heading">Join Finessse</h1>

        {bad && (
          <p className="mt-3 text-sm text-gray">
            This invitation link is invalid, revoked, or expired. Ask an admin to send a new one.
          </p>
        )}

        {!bad && invite.status === "accepted" && (
          <p className="mt-3 text-sm text-gray">
            This invitation was already accepted. <a href="/signin" className="text-primary">Sign in</a>.
          </p>
        )}

        {!bad && invite.status === "pending" && (
          <>
            <p className="mt-2 text-sm text-gray">
              Invitation for <span className="font-semibold">{invite.email}</span>. Sign in with
              that <span className="font-semibold">@{WORKSPACE_DOMAIN}</span> Google account to
              activate your access.
            </p>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/welcome" });
              }}
              className="mt-6"
            >
              <button
                type="submit"
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-white hover:opacity-90"
              >
                Accept &amp; continue with Google
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

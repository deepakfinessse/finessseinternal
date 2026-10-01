import { requireUser, plainUser } from "@/lib/access";
import { listSessions, getUser } from "@/lib/data";
import { getCurrentSessionToken } from "@/lib/session-tracking";
import { Card, Badge } from "@/components/ui";
import { MyProfileForm, MySessionList } from "./profile-client";

export const metadata = { title: "My profile · Finessse" };

export default async function ProfilePage() {
  const me = await requireUser();
  const [sessions, currentToken, myProfile] = await Promise.all([
    listSessions({ userId: me.id }),
    getCurrentSessionToken(),
    getUser(me.id),
  ]);
  const activeSessions = sessions.filter((s) => !s.expired);
  const manager = myProfile?.reportingManagerId ? await getUser(myProfile.reportingManagerId) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">My profile</h1>
        <p className="text-sm text-gray">
          {me.email} · {me.title?.trim() || ""}
        </p>
      </div>

      <Card title="Personal information" description="Your name, title, contact and date of birth.">
        <MyProfileForm me={plainUser(me)} />
        <p className="mt-3 border-t border-gray/15 pt-3 text-sm text-gray">
          Reports to:{" "}
          <span className="font-semibold text-foreground">
            {manager ? manager.name || manager.email : "Not set"}
          </span>
        </p>
      </Card>

      <Card
        title="Sessions & devices"
        description="Where you're signed in, and the app version each device is running."
        action={<Badge tone="active">{activeSessions.length} active</Badge>}
      >
        <MySessionList sessions={activeSessions} currentToken={currentToken} />
      </Card>
    </div>
  );
}

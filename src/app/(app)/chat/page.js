import { requireUser, plainUser } from "@/lib/access";
import { listConversationsForUser, listMessages } from "@/lib/chat";
import { listUsers } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { ChatShell } from "./chat-client";

export const metadata = { title: "Chat · Finessse" };

export default async function ChatPage({ searchParams }) {
  const me = await requireUser();
  const sp = await searchParams;
  const requested = sp.c || null;

  const [conversations, teamUsers] = await Promise.all([
    listConversationsForUser(me.id),
    listUsers({ status: "active" }),
  ]);

  const initialConversationId =
    (requested && conversations.some((c) => c.id === requested) ? requested : null) ||
    conversations[0]?.id ||
    null;

  const initialMessages = initialConversationId
    ? await listMessages(initialConversationId, me.id, { limit: 50 })
    : [];

  return (
    <div className="flex h-[75vh] min-h-[460px] flex-col gap-4">
      <PageHeader eyebrow="People" title="Chat" description="Direct messages and the team channel." />
      <ChatShell
        me={plainUser(me)}
        initialConversations={conversations}
        initialMessages={initialMessages}
        initialConversationId={initialConversationId}
        teamUsers={teamUsers.filter((u) => u.id !== me.id)}
      />
    </div>
  );
}

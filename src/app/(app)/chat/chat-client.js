"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, EmptyState, relTime } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  sendMessage as sendMessageAction,
  markConversationRead as markConversationReadAction,
  startDirectConversation as startDirectConversationAction,
} from "@/lib/actions/chat";

const CONVO_POLL_MS = 10000;
const MESSAGE_POLL_MS = 2500;

function ConversationRow({ convo, active, onClick }) {
  const label = convo.type === "channel" ? "Team" : convo.name;
  const preview = convo.lastMessage?.text || "No messages yet";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors ${
        active ? "bg-surface-3" : "hover:bg-surface-2"
      }`}
    >
      {convo.type === "channel" ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-accent">
          <Icon name="people" size={15} />
        </span>
      ) : (
        <Avatar name={convo.otherUser?.name} email={convo.otherUser?.email} src={convo.otherUser?.image} size={32} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-[13px] ${convo.unreadCount ? "font-semibold text-text" : "font-medium text-dim"}`}>
            {label}
          </span>
          {convo.lastMessageAt && (
            <span className="mono shrink-0 text-[9px] uppercase tracking-[0.1em] text-faint">
              {relTime(convo.lastMessageAt)}
            </span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[11.5px] text-faint">{preview}</span>
          {convo.unreadCount > 0 && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-warn px-1 text-[9px] font-bold text-white">
              {convo.unreadCount > 9 ? "9+" : convo.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function MessageBubble({ message, mine, showSender, senderName }) {
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {showSender && !mine && (
        <span className="mb-0.5 px-1 text-[10.5px] font-semibold text-faint">{senderName}</span>
      )}
      <span
        className={`max-w-[75%] whitespace-pre-wrap break-words rounded-[12px] px-3 py-2 text-[13px] leading-relaxed ${
          mine
            ? "rounded-br-[4px] bg-action text-action-text"
            : "rounded-bl-[4px] bg-surface-2 text-text"
        } ${message.pending ? "opacity-60" : ""}`}
      >
        {message.text}
      </span>
      <span className="mt-0.5 px-1 text-[9.5px] text-faint">{relTime(message.createdAt)}</span>
    </div>
  );
}

export function ChatShell({ me, initialConversations, initialMessages, initialConversationId, teamUsers }) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialConversationId);
  const [messages, setMessages] = useState(initialMessages);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const cursorRef = useRef(initialMessages.at(-1)?.createdAt || null);
  const bottomRef = useRef(null);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast((m) => (m === msg ? null : m)), 3000);
  };

  const markReadLocal = useCallback((conversationId) => {
    const fd = new FormData();
    fd.set("conversationId", conversationId);
    markConversationReadAction(null, fd).catch(() => {});
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)));
  }, []);

  /* -------------------------------------------------- poll: conversation list */
  const pollConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      // ignore, retry next tick
    }
  }, []);

  useEffect(() => {
    let id;
    const kickoff = setTimeout(pollConversations, 0);
    const start = () => {
      if (id) return;
      id = setInterval(pollConversations, CONVO_POLL_MS);
    };
    const stop = () => {
      clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        setTimeout(pollConversations, 0);
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(kickoff);
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollConversations]);

  /* -------------------------------------------------------- poll: messages */
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    let id;

    const reset = () => {
      if (cancelled) return;
      const isInitialSelection = selectedId === initialConversationId;
      setMessages(isInitialSelection ? initialMessages : []);
      cursorRef.current = isInitialSelection ? initialMessages.at(-1)?.createdAt || null : null;
    };

    const loadInitial = async () => {
      try {
        const res = await fetch(`/api/chat/messages?conversationId=${encodeURIComponent(selectedId)}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setMessages(data.messages || []);
        cursorRef.current = data.messages?.at(-1)?.createdAt || null;
        markReadLocal(selectedId);
      } catch {
        // ignore, retry next tick
      }
    };

    const pollNew = async () => {
      if (!cursorRef.current) return;
      try {
        const res = await fetch(
          `/api/chat/messages?conversationId=${encodeURIComponent(selectedId)}&after=${encodeURIComponent(cursorRef.current)}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data.messages?.length) return;
        setMessages((prev) => [...prev, ...data.messages]);
        cursorRef.current = data.messages.at(-1).createdAt;
        markReadLocal(selectedId);
      } catch {
        // ignore, retry next tick
      }
    };

    const start = () => {
      if (id) return;
      id = setInterval(pollNew, MESSAGE_POLL_MS);
    };
    const stop = () => {
      clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        setTimeout(pollNew, 0);
        start();
      }
    };

    const kickoff = setTimeout(() => {
      reset();
      loadInitial();
    }, 0);
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(kickoff);
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const selectConversation = (id) => {
    setSelectedId(id);
    try {
      window.history.replaceState(null, "", `/chat?c=${id}`);
    } catch {}
  };

  const startDm = async (userId) => {
    setPickerOpen(false);
    const fd = new FormData();
    fd.set("userId", userId);
    const res = await startDirectConversationAction(null, fd);
    if (!res?.ok) {
      flash(res?.error || "Couldn't start conversation.");
      return;
    }
    setConversations((prev) => {
      if (prev.some((c) => c.id === res.conversationId)) return prev;
      const other = teamUsers.find((u) => u.id === userId);
      return [
        {
          id: res.conversationId,
          type: "dm",
          name: other?.name || other?.email || "Unknown",
          otherUser: other || null,
          lastMessage: null,
          lastMessageAt: new Date().toISOString(),
          unreadCount: 0,
        },
        ...prev,
      ];
    });
    selectConversation(res.conversationId);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const textarea = form.elements.namedItem("text");
    const text = textarea.value;
    if (!text.trim() || !selectedId) return;

    const tempId = `pending:${Math.random().toString(36).slice(2)}`;
    const optimistic = {
      id: tempId,
      conversationId: selectedId,
      senderId: me.id,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    textarea.value = "";

    const fd = new FormData();
    fd.set("conversationId", selectedId);
    fd.set("text", text);
    const res = await sendMessageAction(null, fd);
    if (res?.ok) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? res.message : m)));
      cursorRef.current = res.message.createdAt;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, lastMessage: { text: res.message.text, senderId: me.id, createdAt: res.message.createdAt }, lastMessageAt: res.message.createdAt }
            : c,
        ),
      );
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      flash(res?.error || "Message failed to send.");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const selected = conversations.find((c) => c.id === selectedId) || null;
  let lastSender = null;

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-[14px] border border-line">
      {toast && (
        <div className="animate-in absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-[10px] border border-line-strong bg-surface px-4 py-2 text-[13px] shadow-pop">
          {toast}
        </div>
      )}

      <div className="flex w-64 shrink-0 flex-col border-r border-line bg-surface-2/30">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <span className="text-[12.5px] font-semibold">Conversations</span>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            title="Start a new DM"
            className="flex h-6 w-6 items-center justify-center rounded-md text-dim transition-colors hover:bg-surface-2 hover:text-text"
          >
            <Icon name="plus" size={14} strokeWidth={2.2} />
          </button>
        </div>

        {pickerOpen && (
          <div className="max-h-48 overflow-y-auto border-b border-line">
            {teamUsers.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-faint">No one else here yet.</p>
            ) : (
              teamUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => startDm(u.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-surface-2"
                >
                  <Avatar name={u.name} email={u.email} src={u.image} size={22} />
                  <span className="truncate">{u.name || u.email}</span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-1.5">
          {conversations.map((c) => (
            <ConversationRow key={c.id} convo={c} active={c.id === selectedId} onClick={() => selectConversation(c.id)} />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState title="No conversation selected">
              Pick the Team channel or start a DM to begin.
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
              {selected.type === "channel" ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-accent">
                  <Icon name="people" size={15} />
                </span>
              ) : (
                <Avatar name={selected.otherUser?.name} email={selected.otherUser?.email} src={selected.otherUser?.image} size={30} />
              )}
              <span className="text-[13.5px] font-semibold">
                {selected.type === "channel" ? "Team" : selected.name}
              </span>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <p className="py-8 text-center text-[12.5px] text-faint">
                  No messages yet — say hello.
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.senderId === me.id;
                  const showSender = selected.type === "channel" && m.senderId !== lastSender;
                  lastSender = m.senderId;
                  const senderName =
                    !mine && selected.type === "channel"
                      ? teamUsers.find((u) => u.id === m.senderId)?.name ||
                        teamUsers.find((u) => u.id === m.senderId)?.email ||
                        "Someone"
                      : selected.otherUser?.name || selected.otherUser?.email;
                  return (
                    <MessageBubble key={m.id} message={m} mine={mine} showSender={showSender} senderName={senderName} />
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-line p-3">
              <textarea
                name="text"
                rows={1}
                placeholder={`Message ${selected.type === "channel" ? "the team" : selected.name}…`}
                onKeyDown={handleKeyDown}
                className="max-h-32 flex-1 resize-none rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none placeholder:text-faint focus:border-line"
              />
              <button
                type="submit"
                className="flex h-9 shrink-0 items-center justify-center rounded-[10px] bg-action px-3.5 text-[13px] font-semibold text-action-text transition-opacity hover:opacity-90"
              >
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

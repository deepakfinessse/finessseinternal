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
// Mirrors the server-side limits in src/lib/chat.js.
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 500 * 1024;
const MAX_FILES = 10;

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

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

function Attachment({ a, pending }) {
  if (pending) {
    return (
      <span className="flex max-w-72 items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-text">
        <Icon name="file" size={18} className="shrink-0 text-dim" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium">{a.name}</span>
          <span className="block text-[10.5px] text-faint">{formatBytes(a.size)}</span>
        </span>
      </span>
    );
  }
  if (a.kind === "image") {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-[10px] border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated API route, not optimizable */}
        <img src={a.url} alt={a.name} loading="lazy" className="max-h-64 max-w-full object-contain bg-surface-2" />
      </a>
    );
  }
  if (a.kind === "video") {
    return <video src={a.url} controls preload="metadata" className="max-h-72 max-w-full rounded-[10px] border border-line bg-black" />;
  }
  if (a.kind === "audio") {
    return <audio src={a.url} controls preload="metadata" className="w-72 max-w-full" />;
  }
  return (
    <a
      href={a.contentType === "application/pdf" ? a.url : `${a.url}?download`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex max-w-72 items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-text transition-colors hover:bg-surface-2"
    >
      <Icon name="file" size={18} className="shrink-0 text-dim" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">{a.name}</span>
        <span className="block text-[10.5px] text-faint">{formatBytes(a.size)}</span>
      </span>
      <Icon name="download" size={15} className="shrink-0 text-faint" />
    </a>
  );
}

function MessageBubble({ message, mine, showSender, senderName }) {
  const attachments = message.attachments || [];
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {showSender && !mine && (
        <span className="mb-0.5 px-1 text-[10.5px] font-semibold text-faint">{senderName}</span>
      )}
      {attachments.length > 0 && (
        <div className={`mb-1 flex max-w-[75%] flex-col gap-1.5 ${mine ? "items-end" : "items-start"} ${message.pending ? "opacity-60" : ""}`}>
          {attachments.map((a) => (
            <Attachment key={a.id} a={a} pending={message.pending} />
          ))}
        </div>
      )}
      {message.text && (
        <span
          className={`max-w-[75%] whitespace-pre-wrap break-words rounded-[12px] px-3 py-2 text-[13px] leading-relaxed ${
            mine
              ? "rounded-br-[4px] bg-action text-action-text"
              : "rounded-bl-[4px] bg-surface-2 text-text"
          } ${message.pending ? "opacity-60" : ""}`}
        >
          {message.text}
        </span>
      )}
      <span className="mt-0.5 px-1 text-[9.5px] text-faint">
        {message.pending && attachments.length > 0 ? "Uploading…" : relTime(message.createdAt)}
      </span>
    </div>
  );
}

export function ChatShell({ me, initialConversations, initialMessages, initialConversationId, teamUsers }) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialConversationId);
  const [messages, setMessages] = useState(initialMessages);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const cursorRef = useRef(initialMessages.at(-1)?.createdAt || null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

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

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const bigImage = incoming.find((f) => f.type.startsWith("image/") && f.size > MAX_IMAGE_BYTES);
    if (bigImage) {
      flash(`Image "${bigImage.name}" is larger than 500 KB.`);
      return;
    }
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      flash(`"${tooBig.name}" is larger than 1 MB.`);
      return;
    }
    setPendingFiles((prev) => {
      const next = [...prev, ...incoming.map((file) => ({ key: Math.random().toString(36).slice(2), file }))];
      if (next.length > MAX_FILES) {
        flash(`You can attach up to ${MAX_FILES} files at once.`);
        return prev;
      }
      return next;
    });
  };

  const removePendingFile = (key) => setPendingFiles((prev) => prev.filter((p) => p.key !== key));

  const handlePaste = (e) => {
    if (e.clipboardData?.files?.length) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer?.files);
  };

  const selectConversation = (id) => {
    setPendingFiles([]);
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
    const files = pendingFiles.map((p) => p.file);
    if ((!text.trim() && !files.length) || !selectedId) return;

    const tempId = `pending:${Math.random().toString(36).slice(2)}`;
    const optimistic = {
      id: tempId,
      conversationId: selectedId,
      senderId: me.id,
      text: text.trim(),
      attachments: files.map((f, i) => ({
        id: `${tempId}:${i}`,
        name: f.name,
        size: f.size,
        contentType: f.type,
        kind: "file",
        url: "#",
      })),
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    textarea.value = "";
    setPendingFiles([]);

    const fd = new FormData();
    fd.set("conversationId", selectedId);
    fd.set("text", text);
    let res;
    if (files.length) {
      // Attachments go through the route handler — server actions cap bodies at 1 MB.
      for (const f of files) fd.append("files", f);
      try {
        const r = await fetch("/api/chat/messages", { method: "POST", body: fd });
        res = await r.json().catch(() => ({ ok: false, error: "Upload failed." }));
      } catch {
        res = { ok: false, error: "Upload failed — check your connection." };
      }
    } else {
      res = await sendMessageAction(null, fd);
    }
    if (res?.ok) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? res.message : m)));
      cursorRef.current = res.message.createdAt;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                lastMessage: {
                  text:
                    res.message.text ||
                    (res.message.attachments.length === 1
                      ? `📎 ${res.message.attachments[0].name}`
                      : `📎 ${res.message.attachments.length} files`),
                  senderId: me.id,
                  createdAt: res.message.createdAt,
                },
                lastMessageAt: res.message.createdAt,
              }
            : c,
        ),
      );
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      // Give the user their draft back so they can fix and retry.
      if (!textarea.value) textarea.value = text;
      if (files.length) setPendingFiles((prev) => (prev.length ? prev : optimistic.attachments.map((a, i) => ({ key: a.id, file: files[i] }))));
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

            <form
              onSubmit={handleSend}
              onDragOver={(e) => {
                if (!e.dataTransfer?.types?.includes("Files")) return;
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
              }}
              onDrop={handleDrop}
              className={`border-t border-line p-3 transition-colors ${dragging ? "bg-surface-2" : ""}`}
            >
              {pendingFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {pendingFiles.map((p) => (
                    <span
                      key={p.key}
                      className="flex max-w-56 items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1 pl-2 pr-1 text-[11.5px]"
                    >
                      <Icon name="file" size={13} className="shrink-0 text-dim" />
                      <span className="truncate">{p.file.name}</span>
                      <span className="shrink-0 text-faint">{formatBytes(p.file.size)}</span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(p.key)}
                        title="Remove"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint transition-colors hover:bg-surface-3 hover:text-text"
                      >
                        <Icon name="close" size={11} strokeWidth={2.2} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach photos (max 500 KB), videos or files (max 1 MB)"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line-strong text-dim transition-colors hover:bg-surface-2 hover:text-text"
                >
                  <Icon name="paperclip" size={16} />
                </button>
                <textarea
                  name="text"
                  rows={1}
                  placeholder={
                    dragging
                      ? "Drop files to attach…"
                      : `Message ${selected.type === "channel" ? "the team" : selected.name}…`
                  }
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  className="max-h-32 flex-1 resize-none rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none placeholder:text-faint focus:border-line"
                />
                <button
                  type="submit"
                  className="flex h-9 shrink-0 items-center justify-center rounded-[10px] bg-action px-3.5 text-[13px] font-semibold text-action-text transition-opacity hover:opacity-90"
                >
                  Send
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

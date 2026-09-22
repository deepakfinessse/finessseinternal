"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { relTime } from "@/components/ui";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications";

const POLL_MS = 12000;

const TONE = {
  "task.blocked": "warn",
  "task.overdue": "warn",
  "task.rejected": "warn",
  "task.unblocked": "ok",
  "task.approved": "ok",
  "task.approval_requested": "caution",
  "task.assigned": "accent",
  "task.collaborator_added": "accent",
  "project.assigned": "accent",
  "task.reopened": "caution",
  "role.assigned": "accent",
  "invite.accepted": "ok",
};

function Dot({ type }) {
  const tone = TONE[type] || "accent";
  const color =
    tone === "warn" ? "var(--warn)" : tone === "ok" ? "var(--ok)" : tone === "caution" ? "var(--caution)" : "var(--accent)";
  return <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />;
}

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
      setCount(data.unreadCount || 0);
      setLoaded(true);
    } catch {
      // offline / signed out mid-poll — ignore, try again next tick
    }
  }, []);

  useEffect(() => {
    // Defer the initial fetch to a timer tick (rather than calling the
    // state-setting `poll` synchronously in the effect body) so mount stays a
    // pure subscribe-to-timers effect.
    let id;
    const kickoff = setTimeout(poll, 0);
    const start = () => {
      if (id) return;
      id = setInterval(poll, POLL_MS);
    };
    const stop = () => {
      clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        setTimeout(poll, 0);
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
  }, [poll]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setCount((c) => Math.max(0, c - 1));
      const fd = new FormData();
      fd.set("id", n.id);
      markNotificationRead(null, fd).catch(() => {});
    }
    if (n.link) router.push(n.link);
  };

  const markAll = async (e) => {
    e.stopPropagation();
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setCount(0);
    markAllNotificationsRead().catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-line text-dim transition-colors hover:border-line-strong hover:text-text"
      >
        <Icon name="bell" size={16} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[9px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-in absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-[12px] border border-line-strong bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <span className="text-[13px] font-semibold">Notifications</span>
            {count > 0 && (
              <button type="button" onClick={markAll} className="text-[11px] text-dim hover:text-text">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!loaded ? (
              <p className="px-3.5 py-6 text-center text-[12px] text-faint">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-[12px] text-faint">You&apos;re all caught up.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-line px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-surface-2 ${
                    n.read ? "" : "bg-surface-2/50"
                  }`}
                >
                  <Dot type={n.type} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[12.5px] leading-snug ${n.read ? "text-dim" : "font-semibold text-text"}`}>
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block truncate text-[11px] text-faint">{n.body}</span>
                    )}
                    <span className="mono mt-1 block text-[9px] uppercase tracking-[0.1em] text-faint">
                      {relTime(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

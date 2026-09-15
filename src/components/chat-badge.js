"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

const POLL_MS = 12000;

export function ChatBadge() {
  const [count, setCount] = useState(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/unread", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setCount(data.chatUnread || 0);
    } catch {
      // offline / signed out mid-poll — ignore, try again next tick
    }
  }, []);

  useEffect(() => {
    // Deferred kickoff (see notification-bell.js) so the effect body doesn't
    // synchronously call a state-setting function.
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

  return (
    <Link
      href="/chat"
      title="Chat"
      className="relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-line text-dim transition-colors hover:border-line-strong hover:text-text"
    >
      <Icon name="comment" size={16} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[9px] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

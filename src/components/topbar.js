"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Kbd } from "@/components/ui";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { ChatBadge } from "@/components/chat-badge";
import { AttendanceWidget } from "@/components/attendance-widget";

const TITLES = [
  [/^\/dashboard/, "Pulse"],
  [/^\/tasks\/new/, "New task"],
  [/^\/tasks\/[^/]+$/, "Task"],
  [/^\/tasks/, "Board"],
  [/^\/timeline/, "Timeline"],
  [/^\/heatmap/, "Heatmap"],
  [/^\/chat/, "Chat"],
  [/^\/projects\/[^/]+$/, "Project"],
  [/^\/projects/, "Projects"],
  [/^\/team\/[^/]+$/, "Person"],
  [/^\/team/, "People"],
  [/^\/onboarding/, "Onboarding"],
  [/^\/sessions/, "Sessions"],
  [/^\/analytics/, "Intelligence"],
  [/^\/settings\/roles/, "Roles & Access"],
  [/^\/settings\/versions/, "Releases"],
  [/^\/settings\/onboarding/, "Onboarding steps"],
  [/^\/audit/, "Audit log"],
  [/^\/profile/, "My profile"],
  [/^\/attendance/, "Attendance"],
];

function titleFor(path) {
  for (const [re, t] of TITLES) if (re.test(path)) return t;
  return "Finessse";
}

export function Topbar({ canCreateTask, canTrackAttendance }) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/tasks?q=${encodeURIComponent(term)}` : "/tasks");
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <Link href="/dashboard" className="shrink-0 md:hidden" aria-label="Home">
        <Logo className="h-5 w-auto text-text" />
      </Link>
      <h1 className="hidden shrink-0 text-[15px] font-semibold tracking-[-0.01em] sm:block">
        {titleFor(pathname)}
      </h1>

      <form onSubmit={submit} className="relative mx-auto w-full max-w-xl">
        <Icon
          name="search"
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks…"
          className="h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-16 text-[13px] outline-none transition-colors placeholder:text-faint focus:border-line-strong"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden items-center gap-1 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </form>

      <div className="flex shrink-0 items-center gap-2">
        {canTrackAttendance && <AttendanceWidget />}
        <ChatBadge />
        <NotificationBell />
        {canCreateTask && (
          <Link
            href="/tasks/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-action px-3 text-[13px] font-semibold text-action-text transition-opacity hover:opacity-90"
          >
            <Icon name="plus" size={15} strokeWidth={2} />
            New
          </Link>
        )}
      </div>
    </header>
  );
}

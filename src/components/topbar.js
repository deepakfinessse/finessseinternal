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
import { useMobileNav } from "@/components/mobile-nav";

const TITLES = [
  [/^\/dashboard/, "Pulse"],
  [/^\/tasks\/new/, "New task"],
  [/^\/tasks\/[^/]+$/, "Task"],
  [/^\/tasks/, "Task Board"],
  [/^\/timeline/, "Timeline"],
  [/^\/heatmap/, "Heatmap"],
  [/^\/leaderboard/, "Leaderboard"],
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
  const { toggle } = useMobileNav();

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
      <button
        type="button"
        onClick={toggle}
        aria-label="Open menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line text-dim transition-colors hover:border-line-strong hover:text-text md:hidden"
      >
        <Icon name="menu" size={17} />
      </button>
      <Link href="/dashboard" className="shrink-0 md:hidden" aria-label="Home">
        <Logo className="h-5 w-auto text-text" />
      </Link>
      <h1 className="hidden shrink-0 text-[15px] font-semibold tracking-[-0.01em] sm:block">
        {titleFor(pathname)}
      </h1>

      <form onSubmit={submit} className="relative mx-auto hidden w-full max-w-xl sm:block">
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
      <Link
        href="/tasks"
        aria-label="Search tasks"
        className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line text-dim transition-colors hover:border-line-strong hover:text-text sm:hidden"
      >
        <Icon name="search" size={15} />
      </Link>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {canTrackAttendance && <AttendanceWidget />}
        <ChatBadge />
        <NotificationBell />
        {canCreateTask && (
          <Link
            href="/tasks/new"
            aria-label="New task"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-action px-2.5 text-[13px] font-semibold text-action-text transition-opacity hover:opacity-90 sm:px-3"
          >
            <Icon name="plus" size={15} strokeWidth={2} />
            <span className="hidden sm:inline">New</span>
          </Link>
        )}
      </div>
    </header>
  );
}

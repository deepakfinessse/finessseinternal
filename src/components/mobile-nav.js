"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const MobileNavContext = createContext(null);

/** Shared open/close state for the mobile sidebar drawer — the toggle button
 *  lives in the Topbar, the drawer itself wraps the server-rendered <aside>,
 *  and neither can reach the other via props since they're siblings under a
 *  Server Component layout. Closes itself on every navigation. */
export function MobileNavProvider({ children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Close on navigation — derived during render (not in an effect) so the
  // React Compiler doesn't flag a synchronous setState-in-effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <MobileNavContext.Provider value={{ open, toggle, close }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be used within MobileNavProvider");
  return ctx;
}

"use client";

import { useMobileNav } from "./mobile-nav";
import { Icon } from "@/components/icons";

/** Wraps the server-rendered sidebar <aside> (passed as children) so it can
 *  slide in as a mobile drawer. On md+ screens this renders as a no-op —
 *  the aside keeps its normal in-flow desktop layout. */
export function MobileSidebarShell({ children }) {
  const { open, close } = useMobileNav();

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={close}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[232px] transition-transform duration-200 ease-out md:static md:z-auto md:w-auto md:translate-x-0 md:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={close}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-[10px] border border-line bg-bg text-dim md:hidden"
        >
          <Icon name="close" size={15} />
        </button>
        {children}
      </div>
    </>
  );
}

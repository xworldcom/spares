"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { isNavActive } from "@/lib/nav-active";

const MACHINE_FAMILY_HREFS = ["/machines", "/machines/new"] as const;

export function machinesFamilyActive(
  pathname: string,
  hrefs: readonly string[],
): boolean {
  return (
    isNavActive(pathname, "/machines", hrefs) ||
    isNavActive(pathname, "/machines/new", hrefs)
  );
}

function menuItemClass(active: boolean) {
  return active
    ? "flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold tracking-tight text-[var(--spares-ink)]"
    : "spares-muted flex min-h-11 items-center rounded-xl px-3 text-sm font-medium tracking-tight transition-colors duration-200 hover:text-[var(--spares-ink)]";
}

export function StaffMachinesDesktopNav({ hrefs }: { hrefs: readonly string[] }) {
  const pathname = usePathname();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const familyActive = machinesFamilyActive(pathname, hrefs);
  const listActive = isNavActive(pathname, "/machines", hrefs);
  const uploadActive = isNavActive(pathname, "/machines/new", hrefs);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-machines-nav-menu]")) {
        return;
      }
      setOpen(false);
    }
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" data-machines-nav-menu>
      <button
        type="button"
        id={`${menuId}-trigger`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${menuId}-menu`}
        onClick={() => setOpen((current) => !current)}
        className={
          familyActive
            ? "inline-flex h-11 items-center gap-1 px-3 text-sm font-semibold tracking-tight"
            : "spares-muted inline-flex h-11 items-center gap-1 px-3 text-sm font-medium tracking-tight transition-colors duration-200 hover:text-[var(--spares-ink)]"
        }
      >
        Machines
        <span aria-hidden="true" className="text-xs leading-none opacity-70">
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={`${menuId}-menu`}
          role="menu"
          aria-labelledby={`${menuId}-trigger`}
          className="spares-surface absolute top-full left-0 z-[70] mt-1 min-w-[11rem] rounded-2xl p-1 shadow-[0_16px_40px_rgba(0,0,0,0.42)]"
        >
          <Link
            href="/machines"
            role="menuitem"
            aria-current={listActive ? "page" : undefined}
            className={menuItemClass(listActive)}
            onClick={() => setOpen(false)}
          >
            All machines
          </Link>
          <Link
            href="/machines/new"
            role="menuitem"
            aria-current={uploadActive ? "page" : undefined}
            className={menuItemClass(uploadActive)}
            onClick={() => setOpen(false)}
          >
            Upload
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function staffMachinesMenuLinks(onNavigate?: () => void) {
  return (
    <>
      <Link
        href="/machines"
        className="flex min-h-12 items-center rounded-2xl px-4 text-[16px] font-medium"
        onClick={onNavigate}
      >
        All machines
      </Link>
      <Link
        href="/machines/new"
        className="flex min-h-12 items-center rounded-2xl px-4 text-[16px] font-medium"
        onClick={onNavigate}
      >
        Upload
      </Link>
    </>
  );
}

export { MACHINE_FAMILY_HREFS };

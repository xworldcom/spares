"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PublicUser } from "@/lib/api/types";

function initialsFor(user: PublicUser) {
  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const email = user.email.trim();
  return email.slice(0, 2).toUpperCase();
}

function roleLabel(role: PublicUser["role"]) {
  return role === "staff" ? "Staff" : "Customer";
}

export function AccountBubbleMenu({
  user,
  onSignOut,
}: {
  user: PublicUser;
  onSignOut: () => void;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; right: number } | null>(
    null,
  );

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
      if (target instanceof Element && target.closest("[data-account-menu]")) {
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

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    function place() {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setMenuStyle({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const initials = initialsFor(user);
  const displayName = user.name?.trim() || user.email;

  return (
    <div className="relative inline-flex" data-account-menu>
      <button
        ref={triggerRef}
        type="button"
        id={`${menuId}-trigger`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${menuId}-menu`}
        aria-label={`Account menu, ${displayName}`}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-sm font-semibold tracking-tight ring-1 ring-white/12 transition-colors hover:bg-white/14"
      >
        {initials}
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              id={`${menuId}-menu`}
              role="menu"
              aria-labelledby={`${menuId}-trigger`}
              data-account-menu=""
              className="spares-surface fixed z-[90] w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl p-2 shadow-[0_16px_40px_rgba(0,0,0,0.42)]"
              style={{ top: menuStyle.top, right: menuStyle.right }}
            >
              <div className="px-3 py-2.5">
                <p className="truncate text-sm font-semibold tracking-tight">{displayName}</p>
                {displayName.trim().toLowerCase() !== user.email.trim().toLowerCase() ? (
                  <p className="spares-muted mt-0.5 truncate text-xs">{user.email}</p>
                ) : null}
                <p className="spares-muted mt-1 text-[11px] font-medium uppercase tracking-[0.14em]">
                  {roleLabel(user.role)}
                </p>
              </div>
              <button
                type="button"
                role="menuitem"
                className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-[#f0c4c0] transition-colors hover:bg-white/6"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
              >
                Sign out
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

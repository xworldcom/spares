"use client";

import { useSyncExternalStore } from "react";

/** Wide layout: ticket split panes, resizable staff machine split. */
export const DESKTOP_STAGE = "(min-width: 1024px)";

/**
 * Side-docked quote tray and inline Care/quote Messages column — pointer-primary
 * desktops only. Coarse-pointer tablets (iPad) keep the bottom overlay sheet.
 */
/** Inline Messages column on xl+ desktops — 1440×900 keeps overlay + snap handle (#421 item 7). */
export const CONVERSATION_DOCK_STAGE = "(min-width: 1536px) and (pointer: fine)";

function subscribeMedia(query: string, onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function subscribeDesktop(onChange: () => void) {
  return subscribeMedia(DESKTOP_STAGE, onChange);
}

function subscribeConversationDock(onChange: () => void) {
  return subscribeMedia(CONVERSATION_DOCK_STAGE, onChange);
}

function matchesDesktop() {
  return window.matchMedia(DESKTOP_STAGE).matches;
}

function matchesConversationDock() {
  return window.matchMedia(CONVERSATION_DOCK_STAGE).matches;
}

export function useDesktopStage() {
  return useSyncExternalStore(subscribeDesktop, matchesDesktop, () => false);
}

export function useConversationDockStage() {
  return useSyncExternalStore(
    subscribeConversationDock,
    matchesConversationDock,
    () => false,
  );
}

/** True below xl width — force overlay snap sheet (avoids inline-only Messages on tablet widths). */
export const OVERLAY_CONVERSATION_SHEET_STAGE = "(max-width: 1535px)";

function subscribeOverlayConversation(onChange: () => void) {
  return subscribeMedia(OVERLAY_CONVERSATION_SHEET_STAGE, onChange);
}

function matchesOverlayConversation() {
  return window.matchMedia(OVERLAY_CONVERSATION_SHEET_STAGE).matches;
}

export function useOverlayConversationSheet() {
  return useSyncExternalStore(
    subscribeOverlayConversation,
    matchesOverlayConversation,
    () => true,
  );
}

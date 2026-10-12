"use client";

import { useSyncExternalStore } from "react";

/** Wide layout: ticket split panes, resizable staff machine split. */
export const DESKTOP_STAGE = "(min-width: 1024px)";

/**
 * Side-docked quote tray and inline Care/quote Messages column — pointer-primary
 * desktops only. Coarse-pointer tablets (iPad) keep the bottom overlay sheet.
 */
/** Care / ticket hub: side column from 1536px (1440 keeps overlay snap for Close proofs). */
export const CONVERSATION_DOCK_STAGE = "(min-width: 1536px) and (pointer: fine)";

/** Staff/customer quote detail: inline Messages column from 1280px (#428 live @1440). */
export const QUOTE_CONVERSATION_DOCK_STAGE =
  "(min-width: 1280px) and (pointer: fine)";

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

function subscribeQuoteConversationDock(onChange: () => void) {
  return subscribeMedia(QUOTE_CONVERSATION_DOCK_STAGE, onChange);
}

function matchesDesktop() {
  return window.matchMedia(DESKTOP_STAGE).matches;
}

function matchesConversationDock() {
  return window.matchMedia(CONVERSATION_DOCK_STAGE).matches;
}

function matchesQuoteConversationDock() {
  return window.matchMedia(QUOTE_CONVERSATION_DOCK_STAGE).matches;
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

export function useQuoteConversationDockStage() {
  return useSyncExternalStore(
    subscribeQuoteConversationDock,
    matchesQuoteConversationDock,
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

export const QUOTE_OVERLAY_CONVERSATION_SHEET_STAGE = "(max-width: 1279px)";

function subscribeQuoteOverlayConversation(onChange: () => void) {
  return subscribeMedia(QUOTE_OVERLAY_CONVERSATION_SHEET_STAGE, onChange);
}

function matchesQuoteOverlayConversation() {
  return window.matchMedia(QUOTE_OVERLAY_CONVERSATION_SHEET_STAGE).matches;
}

export function useQuoteOverlayConversationSheet() {
  return useSyncExternalStore(
    subscribeQuoteOverlayConversation,
    matchesQuoteOverlayConversation,
    () => true,
  );
}

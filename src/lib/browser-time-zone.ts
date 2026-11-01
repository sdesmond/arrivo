"use client";

import { useSyncExternalStore } from "react";

const SERVER_ZONE = "UTC";
const subscribeToZone = () => () => {};
const readBrowserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || SERVER_ZONE;
const readServerZone = () => SERVER_ZONE;

const SERVER_LOCALE = "en-US";
const readBrowserLocale = () => (typeof navigator !== "undefined" && navigator.language) || SERVER_LOCALE;
const readServerLocale = () => SERVER_LOCALE;

/** en-US in the server snapshot and during hydration, then the browser's language; avoids a hydration mismatch. */
export function useBrowserLocale(): string {
  return useSyncExternalStore(subscribeToZone, readBrowserLocale, readServerLocale);
}

/** UTC in the server snapshot and during hydration, then the browser's zone; avoids a hydration mismatch. */
export function useBrowserTimeZone(): string {
  return useSyncExternalStore(subscribeToZone, readBrowserZone, readServerZone);
}

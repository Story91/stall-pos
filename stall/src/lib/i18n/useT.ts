"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Language } from "@/lib/parse/schema";
import { readLanguage, subscribeLanguage } from "@/lib/sell/languageStore";
import { messagesFor, type Messages } from "./index";

// The server render and the first hydration pass use English, so markup always
// matches; the stored choice takes over right after hydration.
const serverLanguage = (): Language => "en";

/** The owner's language; every component that calls this re-renders when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, readLanguage, serverLanguage);
}

/** The message table for the owner's language. */
export function useT(): Messages {
  return messagesFor(useLanguage());
}

/** Keeps `<html lang>` in step with the owner's language, for screen readers and hyphenation. */
export function HtmlLang(): null {
  const language = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return null;
}

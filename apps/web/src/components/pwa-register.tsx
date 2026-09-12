"use client";

import { useEffect } from "react";

/** Registers the shell service worker once on the client. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* private mode / unsupported — ignore */
    });
  }, []);
  return null;
}

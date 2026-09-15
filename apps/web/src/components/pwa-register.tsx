"use client";

import { useEffect } from "react";

/** Registers the shell service worker once on the client. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Local `next dev` must not keep serving a cached landing page.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const registration of regs) void registration.unregister();
      });
      if ("caches" in window) {
        void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      }
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* private mode / unsupported — ignore */
    });
  }, []);
  return null;
}

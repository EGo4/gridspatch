"use client";

import { useEffect, useRef, useState } from "react";

export type QueueStatus = "idle" | "syncing" | "retrying";

type QueueState = { status: QueueStatus; pending: number; attempt: number };

type Listener = (s: QueueState) => void;

const BACKOFF_MS = [1_000, 3_000, 10_000, 30_000];

type QueuedMutation = {
  label: string;
  run: () => Promise<unknown>;
};

export function createMutationQueue(reportError: (label: string, err: unknown, attempt: number) => void) {
  const items: QueuedMutation[] = [];
  let running = false;
  let attempt = 0;
  const listeners = new Set<Listener>();

  const snapshot = (): QueueState => ({
    status: running ? (attempt > 0 ? "retrying" : "syncing") : "idle",
    pending: items.length,
    attempt,
  });

  const notify = () => {
    const s = snapshot();
    listeners.forEach((l) => l(s));
  };

  async function work() {
    if (running) return;
    running = true;
    notify();
    while (items.length > 0) {
      const item = items[0]!;
      try {
        await item.run();
        items.shift();
        attempt = 0;
        notify();
      } catch (err) {
        attempt += 1;
        // Report attempt 1 and then sparsely (every 5th) to avoid log spam during long outages.
        if (attempt === 1 || attempt % 5 === 0) reportError(item.label, err, attempt);
        notify();
        const delay = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]!;
        await new Promise<void>((resolve) => {
          const onOnline = () => { cleanup(); resolve(); };
          const t = setTimeout(() => { cleanup(); resolve(); }, delay);
          const cleanup = () => {
            clearTimeout(t);
            window.removeEventListener("online", onOnline);
          };
          window.addEventListener("online", onOnline, { once: true });
        });
        // loop continues → same item retried, order preserved
      }
    }
    running = false;
    attempt = 0;
    notify();
  }

  return {
    enqueue: (label: string, run: () => Promise<unknown>) => {
      items.push({ label, run });
      notify();
      void work();
    },
    subscribe: (l: Listener) => {
      listeners.add(l);
      l(snapshot());
      return () => { listeners.delete(l); };
    },
  };
}

export function useMutationQueue(reportError: (label: string, err: unknown, attempt: number) => void) {
  const queueRef = useRef<ReturnType<typeof createMutationQueue> | null>(null);
  queueRef.current ??= createMutationQueue(reportError);
  const [state, setState] = useState<QueueState>({ status: "idle", pending: 0, attempt: 0 });

  useEffect(() => queueRef.current!.subscribe(setState), []);

  return { enqueue: queueRef.current.enqueue, ...state };
}

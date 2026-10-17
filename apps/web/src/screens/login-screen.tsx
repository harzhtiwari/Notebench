"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { LockscreenModal } from "@notebook/ui";
import { apiUrl } from "../lib/api";

interface AppStateProbe {
  setupComplete: boolean;
  requiresPasscode: boolean;
}

interface LoginFailureDetails {
  attemptsRemaining?: number | undefined;
  retryAfterSeconds?: number | undefined;
}

interface LoginResponse {
  success?: boolean | undefined;
  sessionRequired?: boolean | undefined;
  error?:
    | {
        code: string;
        message: string;
        details?: LoginFailureDetails | undefined;
      }
    | undefined;
}

/**
 * Owner sign-in screen (ticket 02). Presents the shared `LockscreenModal`
 * when the daemon reports a passcode gate, establishes the sliding session
 * cookie via `/api/session/login`, and surfaces server-driven lockout state
 * (remaining attempts, 60s countdown) without owning any policy itself.
 */
export function LoginScreen({ navigate }: { navigate: (to: string) => void }) {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | undefined>(undefined);
  const [lockedSecondsRemaining, setLockedSecondsRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) {
        clearInterval(timer.current);
      }
    };
  }, []);

  const startLockoutCountdown = useCallback((seconds: number) => {
    setLockedSecondsRemaining(seconds);
    if (timer.current !== undefined) {
      clearInterval(timer.current);
    }
    timer.current = setInterval(() => {
      setLockedSecondsRemaining((remaining) => {
        if (remaining <= 1) {
          if (timer.current !== undefined) {
            clearInterval(timer.current);
            timer.current = undefined;
          }
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    async function probe() {
      try {
        const res = await fetch(apiUrl("/api/app-state"));
        if (res.ok) {
          const data = (await res.json()) as AppStateProbe;
          if (!data.setupComplete) {
            navigate("/setup");
            return;
          }
          if (!data.requiresPasscode) {
            navigate("/");
            return;
          }
        }
      } catch {
        // Server might be booting or offline: present the lockscreen anyway.
      } finally {
        setChecking(false);
      }
    }

    void probe();
  }, [navigate]);

  const handleUnlock = async (passcode: string) => {
    if (busy || lockedSecondsRemaining > 0) {
      return;
    }
    setBusy(true);
    setError(undefined);
    setAttemptsRemaining(undefined);

    try {
      const res = await fetch(apiUrl("/api/session/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = (await res.json()) as LoginResponse;

      if (res.ok) {
        navigate("/");
        return;
      }
      if (res.status === 429) {
        setError(data.error?.message ?? "Too many attempts. Try again shortly.");
        startLockoutCountdown(data.error?.details?.retryAfterSeconds ?? 60);
        return;
      }
      setError(data.error?.message ?? "Sign-in failed. Please try again.");
      const remaining = data.error?.details?.attemptsRemaining;
      setAttemptsRemaining(typeof remaining === "number" ? remaining : undefined);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect to the server.");
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--nb-surface)] p-6 text-[var(--nb-ink)]">
        <div className="text-sm text-[var(--nb-ink-2)]">Checking system state...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--nb-surface)] p-6 text-[var(--nb-ink)]">
      <LockscreenModal
        open
        error={error}
        attemptsRemaining={attemptsRemaining}
        lockedSecondsRemaining={lockedSecondsRemaining}
        onUnlock={(passcode) => {
          void handleUnlock(passcode);
        }}
        onOpenChange={() => {
          navigate("/");
        }}
      />
    </main>
  );
}

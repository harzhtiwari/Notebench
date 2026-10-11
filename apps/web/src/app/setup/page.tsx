"use client";

import React, { useState, useEffect } from "react";
import { Button, Input, Well, WellTitle, WellDescription } from "@notebook/ui";

export default function SetupPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingState, setCheckingState] = useState(true);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function checkExistingSetup() {
      try {
        const res = await fetch("/api/app-state");
        if (res.ok) {
          const data = (await res.json()) as { setupComplete: boolean };
          if (data.setupComplete) {
            setAlreadyCompleted(true);
          }
        }
      } catch {
        // Server might be booting or offline
      } finally {
        setCheckingState(false);
      }
    }

    void checkExistingSetup();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // NIST SP 800-63B-4 client-side length check if passcode is provided
    if (passcode.length > 0 && passcode.length < 15) {
      setErrorMessage(
        "Passcode must be at least 15 characters long (NIST SP 800-63B-4 single-factor standard)."
      );
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          email: email.trim() || undefined,
          passcode: passcode || undefined,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: { code: string; message: string };
      };

      if (!res.ok) {
        if (data.error?.code === "SETUP_ALREADY_COMPLETED") {
          setAlreadyCompleted(true);
          setErrorMessage("Setup has already been completed for this instance.");
        } else {
          setErrorMessage(data.error?.message ?? "Setup failed. Please review inputs.");
        }
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to connect to the server."
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingState) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--nb-surface)] p-6 text-[var(--nb-ink)]">
        <div className="text-sm text-[var(--nb-ink-2)]">Checking system state...</div>
      </main>
    );
  }

  if (alreadyCompleted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--nb-surface)] p-6 text-[var(--nb-ink)]">
        <div className="w-full max-w-md rounded-xl border border-[var(--nb-line-1)] bg-[var(--nb-sheet)] p-6 shadow-sm">
          <h1 className="text-lg font-bold text-[var(--nb-ink)]">Setup Already Completed</h1>
          <p className="mt-2 text-xs text-[var(--nb-ink-2)]">
            This Notebench instance is already initialized with an owner identity. The setup
            route is permanently self-locked per ADR 0002.
          </p>
          <div className="mt-6">
            <Button
              className="w-full text-xs"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Open Workspace
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--nb-surface)] p-6 text-[var(--nb-ink)]">
      <div className="w-full max-w-lg rounded-xl border border-[var(--nb-line-1)] bg-[var(--nb-sheet)] p-8 shadow-md">
        {/* Early Release Notice (PRD L9) */}
        <Well className="mb-6 border-[var(--nb-line-1)] bg-[var(--nb-surface)] p-3">
          <WellTitle className="text-xs font-semibold text-[var(--nb-ink)]">
            Early Release Notice
          </WellTitle>
          <WellDescription className="text-[11px] text-[var(--nb-ink-2)]">
            Notebench 0.1 is an open-source Foundation release. While living artifacts and sources
            are safeguarded, regular backups are strongly recommended before major updates.
          </WellDescription>
        </Well>

        <h1 className="text-xl font-bold tracking-tight text-[var(--nb-ink)]">
          Welcome to Notebench
        </h1>
        <p className="mt-1 text-xs text-[var(--nb-ink-2)]">
          Create your sovereign local owner account. A passcode is optional; if left blank,
          Notebench opens in zero-auth local-first mode.
        </p>

        {errorMessage && (
          <div className="mt-4 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            {errorMessage}
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-md border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-600 dark:text-green-400">
            Setup completed successfully! Redirecting to workspace...
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label
              htmlFor="displayName"
              className="block text-xs font-medium text-[var(--nb-ink)]"
            >
              Display Name
            </label>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              placeholder="e.g. Sovereign Researcher"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 h-9 text-xs"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-medium text-[var(--nb-ink)]">
              Email (Optional)
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="e.g. owner@notebench.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-9 text-xs"
            />
          </div>

          <div>
            <label htmlFor="passcode" className="block text-xs font-medium text-[var(--nb-ink)]">
              Session Passcode (Optional)
            </label>
            <Input
              id="passcode"
              name="passcode"
              type="password"
              placeholder="Optional Argon2id protected passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="mt-1 h-9 text-xs"
            />
            <p className="mt-1 text-[11px] text-[var(--nb-ink-2)]">
              Per NIST SP 800-63B-4 single-factor guidelines: Minimum 15 characters, no composition
              rules. Leave blank for zero-auth single-user mode.
            </p>
          </div>

          <div className="mt-4">
            <Button
              type="submit"
              disabled={loading || success}
              className="w-full text-xs"
            >
              {loading ? "Initializing..." : "Complete Setup"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

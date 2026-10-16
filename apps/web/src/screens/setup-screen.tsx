"use client";

import React, { useState, useEffect } from "react";
import { Button, Input, FormField, PasswordInput, FormError, FormSuccess, Notebook, validatePasscode } from "@notebook/ui";
import { apiUrl } from "../lib/api";
import styles from "./setup-screen.module.css";

// Merged from apps/web/src/app/setup/page.tsx (ticket 06): setup screen body
// reused, not duplicated. The two full-document reloads (`window.location.href`)
// are replaced by the owned router's `navigate` so screen switches never cause
// a document request.
export function SetupScreen({ navigate }: { navigate: (to: string) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingState, setCheckingState] = useState(true);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function checkExistingSetup() {
      try {
        const res = await fetch(apiUrl("/api/app-state"));
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

    // Shared policy helper (NIST SP 800-63B-4 single-factor standard).
    // Blank stays valid: no passcode means zero-auth single-user mode.
    const policyError = validatePasscode(passcode);
    setPasscodeError(policyError);
    if (policyError) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(apiUrl("/api/setup"), {
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
        navigate("/");
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
      <main className={styles["screen"]}>
        <div className={`${styles["center"]} ${styles["lockedCard"]}`}>
          <p className={styles["checking"]}>Checking system state...</p>
        </div>
      </main>
    );
  }

  if (alreadyCompleted) {
    return (
      <main className={styles["screen"]}>
        <div className={`${styles["center"]} ${styles["lockedCard"]}`}>
          <h1 className={styles["lockedTitle"]}>Setup Already Completed</h1>
          <p className={styles["lockedBody"]}>
            This Notebench instance is already initialized with an owner identity. The setup
            route is permanently self-locked per ADR 0002.
          </p>
          <Button
            className={styles["submitFull"]}
            onClick={() => {
              navigate("/");
            }}
          >
            Open Workspace
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles["screen"]}>
      <div className={`${styles["center"]} ${styles["layout"]}`}>
        <div className={styles["brand"]}>
          <span className={styles["logoTile"]} aria-hidden="true">
            <Notebook size={24} />
          </span>
          <h1 className={styles["title"]}>
            Welcome to Notebench
          </h1>
          <p className={styles["lede"]}>
            Create your sovereign local owner account. A passcode is optional; if left blank,
            Notebench opens in zero-auth local-first mode.
          </p>
          {/* Early Release Notice (PRD L9) */}
          <div className={styles["noticeWell"]}>
            <h2 className={styles["noticeTitle"]}>
              Early Release Notice
            </h2>
            <p className={styles["noticeBody"]}>
              Notebench 0.1 is an open-source Foundation release. While living artifacts and sources
              are safeguarded, regular backups are strongly recommended before major updates.
            </p>
          </div>
          <p className={styles["nist"]}>
            Per NIST SP 800-63B-4 single-factor guidelines: Minimum 15 characters, no composition
            rules. Leave blank for zero-auth single-user mode.
          </p>
        </div>

        <div className={styles["formCard"]}>
          <form onSubmit={handleSubmit} data-testid="setup-form" className={styles["form"]}>
            {errorMessage && (
            <FormError>
              {errorMessage}
            </FormError>
          )}

          {success && (
            <FormSuccess>
              Setup completed successfully! Redirecting to workspace...
            </FormSuccess>
          )}

            <FormField label="Display Name">
              <Input
                id="displayName"
                name="displayName"
                type="text"
                placeholder="e.g. Sovereign Researcher"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </FormField>

            <FormField label="Email (Optional)">
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="e.g. owner@notebench.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>

            <FormField
              label="Session Passcode (Optional)"
              hint="Minimum 15 characters when set. Leave blank for zero-auth mode."
              error={passcodeError ?? undefined}
            >
              <PasswordInput
                id="passcode"
                name="passcode"
                placeholder="Optional Argon2id protected passcode"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (passcodeError) {
                    setPasscodeError(null);
                  }
                }}
              />
            </FormField>

            <Button
              type="submit"
              disabled={loading || success}
              className={styles["submitFull"]}
            >
              {loading ? "Initializing..." : "Complete Setup"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

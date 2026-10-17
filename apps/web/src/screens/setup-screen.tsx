"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertBanner,
  Button,
  FormError,
  FormField,
  Input,
  Notebook,
  BookOpen,
  ShieldCheck,
  Sparkle,
  PanelDescription,
  PanelTitle,
  PasswordInput,
  resolveIconProps,
  validatePasscode,
} from "@notebench/ui";
import type { AppStateResult, SetupOwnerInput, SetupOwnerResult } from "@notebench/contracts";
import { ApiRequestError, fetchApiJson } from "../lib/api";

/**
 * First-run owner setup screen (ticket 01, PRD A1/A2).
 *
 * Two-column layout: brand panel on the ground surface (left), the setup form
 * on the sheet surface (right). The form renders optimistically — even while
 * the app-state probe is in flight or has failed — because the server is the
 * authoritative duplicate-owner gate (`POST /setup` is an atomic guarded
 * insert that answers 409 SETUP_ALREADY_COMPLETED). Presentational only; the
 * owned shell router performs every navigation via the `navigate` prop.
 */
export interface SetupScreenProps {
  /** Shell-owned navigation (history pushState; never a document reload). */
  navigate: (to: string) => void;
}

interface SetupFieldErrors {
  displayName?: string | undefined;
  email?: string | undefined;
  passcode?: string | undefined;
}

const PROBE_WARN_TITLE = "Status check failed";
const PROBE_WARN_MESSAGE =
  "Could not confirm whether setup already finished. The server still prevents a duplicate owner.";
const NETWORK_FAILURE_MESSAGE = "Setup failed. Check the daemon and try again.";

const FEATURES = [
  { icon: BookOpen, title: "Source-grounded answers", description: "Cite notebooks back to their sources." },
  { icon: Sparkle, title: "Living artifacts", description: "Reports, study guides and quizzes that stay editable block by block." },
  { icon: ShieldCheck, title: "Local-first & private", description: "Your vault stays on this machine with zero telemetry." },
] as const;

export function SetupScreen({ navigate }: SetupScreenProps) {
  const [probeFailed, setProbeFailed] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SetupFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // App-state probe: redirect on an already-owned install, warn on failure.
  // Runs in effects only so `/setup` static prerender stays "use client"-safe.
  useEffect(() => {
    let active = true;
    fetchApiJson<AppStateResult>("/api/app-state")
      .then((state) => {
        if (active === false) {
          return;
        }
        if (state.setupComplete) {
          navigate(destinationForApp(state));
        }
      })
      .catch(() => {
        if (active === false) {
          return;
        }
        setProbeFailed(true);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  // Landing choice after an already-complete state: the gate exists only when
  // the owner's passcode does (domain getAppState semantics).
  function destinationForApp(state: AppStateResult): "/login" | "/" {
    return state.requiresPasscode === true || state.signInRequired === true ? "/login" : "/";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const clientError = validatePasscode(passcode);
    if (clientError !== null) {
      setFieldErrors({ passcode: clientError });
      return;
    }
    setFieldErrors({});
    setNotice(null);
    setSubmitting(true);

    const body: SetupOwnerInput = {};
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();
    if (trimmedName !== "") {
      body.displayName = trimmedName;
    }
    if (trimmedEmail !== "") {
      body.email = trimmedEmail;
    }
    if (passcode !== "") {
      body.passcode = passcode;
    }

    try {
      const result = await fetchApiJson<SetupOwnerResult>("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      navigate(result.owner.hasPasscode ? "/login" : "/");
      return;
    } catch (error: unknown) {
      setSubmitting(false);
      if (error instanceof ApiRequestError) {
        if (error.code === "SETUP_ALREADY_COMPLETED") {
          setFieldErrors({});
          setNotice(null);
          // Re-probe instead of guessing: if the existing owner has no
          // passcode the app opens with no sign-in step (authoritative
          // domain getAppState semantics).
          try {
            const state = await fetchApiJson<AppStateResult>("/api/app-state");
            navigate(destinationForApp(state));
          } catch {
            // Re-probe unavailable: assume the conservative gate.
            navigate("/login");
          }
          return;
        }
        const next: SetupFieldErrors = {};
        let mapped = false;
        for (const issue of error.issues) {
          const field = issue.path.split(".")[0] ?? "";
          if (field === "displayName" || field === "email" || field === "passcode") {
            mapped = true;
            next[field] = issue.message;
          }
        }
        if (mapped) {
          setFieldErrors(next);
        } else {
          setNotice(error.message);
        }
        return;
      }
      setNotice(NETWORK_FAILURE_MESSAGE);
    }
  }

  return (
    <main className="grid min-w-0 min-h-dvh grid-cols-1 md:grid-cols-2">
      <section className="grid min-w-0 place-content-center bg-[var(--nb-ground)] p-[var(--nb-space-8)]">
        <div className="grid w-[min(var(--nb-layout-measure),calc(100%-var(--nb-space-8)))] gap-[var(--nb-space-5)]">
          <span className="grid h-[var(--nb-size-logo)] w-[var(--nb-size-logo)] place-items-center rounded-[var(--nb-radius-menu)] bg-[var(--nb-well)] text-[var(--nb-ink-2)]">
            <Notebook {...resolveIconProps({ size: "lg" })} />
          </span>
          <h2 className="font-[family-name:var(--nb-font-ui)] text-[length:var(--nb-text-2xl)] font-[number:var(--nb-weight-semibold)] leading-[var(--nb-leading-tight)] tracking-[var(--nb-tracking-tight)] text-[var(--nb-ink)]">
            Notebench
          </h2>
          <PanelDescription className="font-[family-name:var(--nb-font-read)] leading-[var(--nb-leading-read)]">
            A source-grounded research workspace: ask questions about your notes
            and keep every answer pinned to where it came from.
          </PanelDescription>
          <ul className="hidden gap-[var(--nb-space-4)] md:grid">
            {FEATURES.map((feature) => (
              <li key={feature.description} className="flex items-start gap-[var(--nb-space-3)]">
                <span className="grid h-[var(--nb-size-tile-icon)] w-[var(--nb-size-tile-icon)] shrink-0 place-items-center rounded-[var(--nb-radius-menu)] bg-[var(--nb-well)] text-[var(--nb-ink-2)]">
                  <feature.icon {...resolveIconProps({ size: "md" })} />
                </span>
                <span className="grid min-w-0 gap-[var(--nb-space-0-5)]">
                  <span className="text-[length:var(--nb-text-sm)] font-[number:var(--nb-weight-semibold)] text-[var(--nb-ink)]">
                    {feature.title}
                  </span>
                  <span className="text-[length:var(--nb-text-xs)] text-[var(--nb-ink-2)]">
                    {feature.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="grid min-w-0 place-content-center border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-8)] border-b md:border-b-0 md:border-l">
        <div className="grid w-[min(var(--nb-layout-modal-md),calc(100%-var(--nb-space-8)))] gap-[var(--nb-space-5)]">
          <header className="grid gap-[var(--nb-space-2)]">
            <PanelTitle as="h1" className="text-[length:var(--nb-text-2xl)]">
              Complete Setup
            </PanelTitle>
            <PanelDescription>
              Create the owner that controls this Notebench. A passcode is
              optional — leave it empty to skip signing in.
            </PanelDescription>
          </header>
          {probeFailed ? (
            <AlertBanner tone="warn" title={PROBE_WARN_TITLE} message={PROBE_WARN_MESSAGE} />
          ) : null}
          {notice !== null ? <FormError>{notice}</FormError> : null}
          <form
            data-testid="setup-form"
            className="grid gap-[var(--nb-space-4)]"
            onSubmit={(event) => {
              const task = handleSubmit(event);
              Promise.resolve(task).catch(() => {
                /* handled inside; never let the submit produce an unhandled rejection */
              });
            }}
          >
            <FormField
              label="Display name"
              error={fieldErrors.displayName}
              hint="Optional. Shown around the workspace."
            >
              <Input
                id="setup-display-name"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                }}
                autoComplete="name"
                maxLength={100}
                disabled={submitting}
              />
            </FormField>
            <FormField label="Email" error={fieldErrors.email} hint="Optional.">
              <Input
                id="setup-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                autoComplete="email"
                disabled={submitting}
              />
            </FormField>
            <FormField
              label="Passcode"
              error={fieldErrors.passcode}
              hint="Optional. At least 15 characters — leave empty for no sign-in."
            >
              <PasswordInput
                id="setup-passcode"
                value={passcode}
                onChange={(event) => {
                  setPasscode(event.target.value);
                }}
                autoComplete="new-password"
                disabled={submitting}
                className="min-h-[var(--nb-size-control-lg)]"
              />
            </FormField>
            <Button
              type="submit"
              variant="nb_btn_primary"
              size="nb_btn_lg"
              className="w-full"
              disabled={submitting}
            >
              Create account
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}

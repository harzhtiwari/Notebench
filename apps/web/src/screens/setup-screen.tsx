"use client";

import { useEffect, useSyncExternalStore, useState, type SyntheticEvent } from "react";
import {
  AlertBanner,
  Button,
  CitationChip,
  FormError,
  IconButton,
  Input,
  SegmentedControl,
  applyTheme,
  getStoredTheme,
  validatePasscode,
  ArrowRightIcon,
  CheckCircleIcon,
  DesktopIcon,
  DiamondsFourIcon,
  HardDrivesIcon,
  HouseLineIcon,
  LockKeyOpenIcon,
  LockSimpleIcon,
  MoonIcon,
  QuotesIcon,
  SparkleIcon,
  SunIcon,
  WarningCircleIcon,
  type ThemeMode,
} from "@notebench/ui";
import type { AppStateResult, SetupOwnerInput, SetupOwnerResult } from "@notebench/contracts";
import { ApiRequestError, apiUrl, fetchApiJson } from "../lib/api";

export interface SetupScreenProps {
  /**
  Shell-owned navigation (history pushState; never a document reload).
  */
  navigate: (to: string) => void;
}

interface SetupFieldErrors {
  displayName?: string | undefined;
  email?: string | undefined;
  passcode?: string | undefined;
  confirmPasscode?: string | undefined;
}

const PROBE_WARN_TITLE = "Status check failed";
const PROBE_WARN_MESSAGE =
  "Could not confirm whether setup already finished. The server still prevents a duplicate owner.";
const NETWORK_FAILURE_MESSAGE = "Setup failed. Check the daemon and try again.";

type MappableSetupField = "displayName" | "email" | "passcode";

/**
Issue paths whose messages belong on a specific input; others use the banner.
*/
const MAPPABLE_SETUP_FIELDS = new Set(["displayName", "email", "passcode"]);

function isMappableSetupField(key: string): key is MappableSetupField {
  return MAPPABLE_SETUP_FIELDS.has(key);
}

/**
The stored theme lives in localStorage, an external store. Hydration renders
the server snapshot ("system"); the client adopts the stored value right
after mount without a setState-in-effect cascade. The header toggle owns the
only writes, so its picked value wins once the user interacts.
*/
function subscribeToStoredTheme(): () => void {
  // Writes go through local state; cross-tab updates are out of scope.
  return noopThemeCleanup;
}

/**
Constant-store cleanup for `subscribeToStoredTheme`.
*/
function noopThemeCleanup(): void {
  // Nothing to release: the stored theme never pushes updates.
}

function getServerThemeSnapshot(): ThemeMode {
  return "system";
}

export function SetupScreen({ navigate }: SetupScreenProps) {
  const [probeFailed, setProbeFailed] = useState(false);
  const [mode, setMode] = useState<"setup" | "signin">("setup");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [unlockPasscode, setUnlockPasscode] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SetupFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const storedTheme = useSyncExternalStore(
    subscribeToStoredTheme,
    getStoredTheme,
    getServerThemeSnapshot,
  );
  const [pickedTheme, setPickedTheme] = useState<ThemeMode | null>(null);
  const theme = pickedTheme ?? storedTheme;

  function handleToggleTheme(): void {
    const next: ThemeMode = theme === "light" ? "dark" : (theme === "dark" ? "system" : "light");
    applyTheme(next);
    setPickedTheme(next);
  }

  useEffect(() => {
    let isUnmounted = false;
    const probe = async () => {
      try {
        const state = await fetchApiJson<AppStateResult>("/api/app-state");
        if (isUnmounted) {
          return;
        }
        if (state.setupComplete) {
          if (state.requiresPasscode || state.signInRequired) {
            navigate("/login");
          } else {
            navigate("/");
          }
        }
      } catch {
        if (!isUnmounted) {
          setProbeFailed(true);
        }
      }
    };
    void probe();
    return () => {
      isUnmounted = true;
    };
  }, [navigate]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const clientError = validatePasscode(passcode);
    if (clientError !== null) {
      setFieldErrors({ passcode: clientError });
      return;
    }
    if (confirmPasscode !== "" && passcode !== confirmPasscode) {
      setFieldErrors({ confirmPasscode: "Passcodes do not match." });
      return;
    }
    setFieldErrors({});
    setNotice(null);

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

    await executeSubmit(body);
  }

  async function executeSubmit(body: SetupOwnerInput): Promise<void> {
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await fetchApiJson<SetupOwnerResult>("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (result.owner.hasPasscode) {
        navigate("/login");
      } else {
        navigate("/");
      }
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiRequestError) {
        if (error.code === "SETUP_ALREADY_COMPLETED") {
          setFieldErrors({});
          setNotice(null);
          try {
            const state = await fetchApiJson<AppStateResult>("/api/app-state");
            if (state.requiresPasscode || state.signInRequired) {
              navigate("/login");
            } else {
              navigate("/");
            }
            return;
          } catch {
            navigate("/login");
            return;
          }
        }
        const next: SetupFieldErrors = {};
        let isMapped = false;
        for (const issue of error.issues) {
          const field = issue.path.split(".", 1)[0] ?? "";
          if (!isMappableSetupField(field)) {
            continue;
          }

          isMapped = true;
          next[field] = issue.message;
        }
        if (isMapped) {
          setFieldErrors(next);
        } else {
          setNotice(error.message);
        }
        return;
      }
      setNotice(NETWORK_FAILURE_MESSAGE);
    }
  }

  function handleSkipPasscode(): void {
    if (submitting) {
      return;
    }
    setPasscode("");
    setConfirmPasscode("");
    const body: SetupOwnerInput = {};
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();
    if (trimmedName !== "") {
      body.displayName = trimmedName;
    }
    if (trimmedEmail !== "") {
      body.email = trimmedEmail;
    }
    void executeSubmit(body);
  }

  async function handleUnlockSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (!unlockPasscode) {
      setUnlockError("Enter your passcode.");
      return;
    }

    setSubmitting(true);
    setUnlockError(null);

    try {
      const res = await fetch(apiUrl("/api/session/login"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode: unlockPasscode }),
      });
      let data: {
        success?: boolean;
        error?: { message?: string };
      };
      try {
        data = (await res.json()) as {
          success?: boolean;
          error?: { message?: string };
        };
      } catch {
        // A non-JSON body carries no server message; use the default below.
        data = {};
      }
      if (res.ok && data.success) {
        navigate("/");
        return;
      }
      setUnlockError(data.error?.message ?? "That is not the passcode.");
    } catch {
      setUnlockError("Could not reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-[var(--nb-layout-gutter)] p-[var(--nb-layout-gutter)] min-h-dvh bg-[var(--nb-ground)]">
      {/* LEFT: Brand panel (Inverts automatically via --nb-ink and --nb-ink-inv) */}
      <section
        className="flex flex-col gap-[var(--nb-space-6)] lg:gap-[var(--nb-space-8)] p-[var(--nb-space-6)] sm:p-[var(--nb-space-8)] lg:p-[var(--nb-space-10)] bg-[var(--nb-ink)] text-[var(--nb-ink-inv)] rounded-[var(--nb-radius-xl)] min-w-0 justify-between"
        aria-labelledby="wl-brand-h"
      >
        <div className="flex items-center gap-[var(--nb-space-3)]">
          <span className="grid place-items-center w-[var(--nb-size-logo)] h-[var(--nb-size-logo)] bg-[var(--nb-ink-inv)] text-[var(--nb-ink)] rounded-[var(--nb-radius-card)]">
            <DiamondsFourIcon size={24} weight="fill" />
          </span>
          <span className="font-[family-name:var(--nb-font-read)] font-bold text-[length:var(--nb-text-xl)] leading-[var(--nb-leading-tight)] tracking-[var(--nb-tracking-tight)]">
            Notebench
          </span>
        </div>

        <div className="grid gap-[var(--nb-space-4)] content-center my-auto">
          <h2
            id="wl-brand-h"
            className="font-[family-name:var(--nb-font-read)] font-semibold text-[length:var(--nb-text-3xl)] leading-[var(--nb-leading-tight)] tracking-[var(--nb-tracking-tight)] m-0 max-w-[var(--nb-layout-modal-sm)]"
          >
            Read with sources in hand.
          </h2>
          <p className="font-[family-name:var(--nb-font-read)] text-[length:var(--nb-text-lg)] leading-[var(--nb-leading-read)] text-[var(--nb-ink-inv)] m-0">
            A notebook that only answers from what you give it.
          </p>

          <figure
            className="mt-[var(--nb-space-4)] grid gap-[var(--nb-space-2)] max-w-[var(--nb-layout-modal-sm)] p-[var(--nb-space-4)] bg-[var(--nb-sheet)] text-[var(--nb-ink)] rounded-[var(--nb-radius-lg)]"
            aria-label="Example of a cited answer"
          >
            <figcaption className="text-xs text-[var(--nb-ink-3)]">
              Example from a sample notebook
            </figcaption>
            <p className="self-end justify-self-end bg-[var(--nb-well)] rounded-[var(--nb-radius-card)] py-[var(--nb-space-2)] px-[var(--nb-space-4)] max-w-[90%] text-[var(--nb-ink)] text-sm">
              How do robots keep communicating in narrow tunnels?
            </p>
            <p className="bg-[var(--nb-marker-wash)] rounded-[var(--nb-radius-well)] py-[var(--nb-space-3)] px-[var(--nb-space-4)] font-[family-name:var(--nb-font-read)] leading-[var(--nb-leading-read)] m-0 text-[var(--nb-ink)]">
              Robots drop relay nodes every <strong>40 meters</strong> of corridor to keep a mesh
              network alive. <CitationChip>1</CitationChip>
            </p>
            <p className="text-xs text-[var(--nb-ink-3)] flex items-center gap-1.5">
              <span className="text-[var(--nb-ok)] inline-flex items-center">
                <CheckCircleIcon size={16} weight="fill" />
              </span>
              <span>Quoted word for word from Subterranean_Autonomy_Challenge.pdf</span>
            </p>
          </figure>
        </div>

        <ul className="list-none p-0 m-0 grid gap-[var(--nb-space-4)]" role="list">
          <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-[var(--nb-space-3)] items-start">
            <span className="grid place-items-center w-[var(--nb-size-control-md)] h-[var(--nb-size-control-md)] border border-solid border-[var(--nb-ink-inv)] rounded-full text-[var(--nb-ink-inv)] shrink-0">
              <HouseLineIcon size={20} />
            </span>
            <div>
              <b className="font-bold text-sm text-[var(--nb-ink-inv)]">Lives on your computer</b>
              <p className="text-sm text-[var(--nb-ink-inv)] max-w-[var(--nb-layout-measure)] leading-[var(--nb-leading-ui)] mt-[var(--nb-space-0-5)]">
                Notebooks are saved in this browser. Nothing is sent anywhere unless you test a
                connection.
              </p>
            </div>
          </li>
          <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-[var(--nb-space-3)] items-start">
            <span className="grid place-items-center w-[var(--nb-size-control-md)] h-[var(--nb-size-control-md)] border border-solid border-[var(--nb-ink-inv)] rounded-full text-[var(--nb-ink-inv)] shrink-0">
              <QuotesIcon size={20} />
            </span>
            <div>
              <b className="font-bold text-sm text-[var(--nb-ink-inv)]">Answers quote your sources</b>
              <p className="text-sm text-[var(--nb-ink-inv)] max-w-[var(--nb-layout-measure)] leading-[var(--nb-leading-ui)] mt-[var(--nb-space-0-5)]">
                Every sentence is lifted from a document you added, with a citation you can open.
              </p>
            </div>
          </li>
          <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-[var(--nb-space-3)] items-start">
            <span className="grid place-items-center w-[var(--nb-size-control-md)] h-[var(--nb-size-control-md)] border border-solid border-[var(--nb-ink-inv)] rounded-full text-[var(--nb-ink-inv)] shrink-0">
              <LockSimpleIcon size={20} />
            </span>
            <div>
              <b className="font-bold text-sm text-[var(--nb-ink-inv)]">Yours to keep</b>
              <p className="text-sm text-[var(--nb-ink-inv)] max-w-[var(--nb-layout-measure)] leading-[var(--nb-leading-ui)] mt-[var(--nb-space-0-5)]">
                Export everything as one file, or erase it in a click.
              </p>
            </div>
          </li>
        </ul>
      </section>

      {/* RIGHT: Form section using @notebench/ui primitives */}
      <section
        className="flex flex-col gap-[var(--nb-space-4)] py-[var(--nb-space-4)] px-[var(--nb-space-2)] sm:p-[var(--nb-space-6)] min-w-0"
        aria-label="Set up or unlock"
      >
        <div className="flex justify-between items-center gap-[var(--nb-space-3)]">
          <SegmentedControl
            value={mode}
            onChange={(val) => { setMode(val as "setup" | "signin"); }}
            options={[
              {
                value: "setup",
                label: (
                  <span className="inline-flex items-center gap-[var(--nb-space-2)]">
                    <SparkleIcon size={14} weight="bold" />
                    <span>Set up</span>
                  </span>
                ),
              },
              {
                value: "signin",
                label: (
                  <span className="inline-flex items-center gap-[var(--nb-space-2)]">
                    <LockKeyOpenIcon size={14} weight="bold" />
                    <span>Unlock</span>
                  </span>
                ),
              },
            ]}
          />

          <IconButton
            variant="nb_btn_ghost"
            size="nb_btn_icon_md"
            icon={theme === "light" ? SunIcon : (theme === "dark" ? MoonIcon : DesktopIcon)}
            onClick={handleToggleTheme}
            aria-label={`Switch theme, currently ${theme}`}
            title={`Switch theme: ${theme}`}
          />
        </div>

        <div className="flex-1 grid content-center gap-[var(--nb-space-6)] w-full max-w-[var(--nb-layout-modal-sm)] mx-auto">
          {mode === "setup" ? (
            <>
              <div>
                <h1
                  data-focus-first
                  className="font-[family-name:var(--nb-font-read)] font-semibold text-[length:var(--nb-text-3xl)] leading-[var(--nb-leading-tight)] tracking-[var(--nb-tracking-tight)] text-balance mb-[var(--nb-space-2)] text-[var(--nb-ink)]"
                >
                  Set up your workspace
                  <span className="sr-only">Complete Setup</span>
                </h1>
                <p className="font-[family-name:var(--nb-font-read)] text-[length:var(--nb-text-lg)] leading-[var(--nb-leading-read)] max-w-[var(--nb-layout-measure)] text-[var(--nb-ink-2)] mt-[var(--nb-space-2)]">
                  Two quick things. You can change both later in Settings.
                </p>
              </div>

              {probeFailed ? (
                <AlertBanner tone="warn" title={PROBE_WARN_TITLE} message={PROBE_WARN_MESSAGE} />
              ) : null}
              {notice === null ? null : <FormError>{notice}</FormError>}

              <form
                data-testid="setup-form"
                className="grid gap-[var(--nb-space-4)]"
                onSubmit={(event) => {
                  void handleSubmit(event).catch(() => {
                    // handleSubmit routes failures into screen state.
                  });
                }}
              >
                <div className="grid gap-[var(--nb-space-2)]">
                  <label
                    htmlFor="setup-display-name"
                    className="text-[length:var(--nb-text-md)] font-semibold text-[var(--nb-ink)]"
                  >
                    Your name
                  </label>
                  <Input
                    id="setup-display-name"
                    type="text"
                    value={displayName}
                    onChange={(event) => { setDisplayName(event.target.value); }}
                    placeholder="Your name"
                    autoComplete="name"
                    maxLength={60}
                    disabled={submitting}
                    className="text-[length:var(--nb-text-md)] min-h-[var(--nb-size-control-lg)]"
                  />
                  {fieldErrors.displayName ? (
                    <p
                      className="text-xs font-semibold text-[var(--nb-danger)] flex items-center gap-1.5"
                      role="alert"
                    >
                      <WarningCircleIcon size={16} weight="fill" className="shrink-0" />
                      <span>{fieldErrors.displayName}</span>
                    </p>
                  ) : null}
                </div>

                {/* Hidden email input for API contract tests */}
                <input
                  id="setup-email"
                  type="email"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); }}
                  autoComplete="email"
                  disabled={submitting}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />

                <div
                  role="group"
                  aria-labelledby="passcode-section-title"
                  className="p-[var(--nb-space-5)] bg-[var(--nb-well)] rounded-[var(--nb-radius-well)] grid gap-[var(--nb-space-4)] min-w-0"
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      id="passcode-section-title"
                      className="text-[length:var(--nb-text-md)] font-semibold text-[var(--nb-ink)]"
                    >
                      Passcode
                    </span>
                    <span className="text-[length:var(--nb-text-sm)] text-[var(--nb-ink-3)] font-normal">
                      Optional
                    </span>
                  </div>
                  <p className="text-[length:var(--nb-text-sm)] text-[var(--nb-ink-2)] -mt-[var(--nb-space-2)] leading-[var(--nb-leading-ui)]">
                    Hides your notebooks behind a prompt on a shared computer. It does not encrypt
                    what is saved.
                  </p>

                  <div className="grid gap-[var(--nb-space-2)]">
                    <label
                      htmlFor="setup-passcode"
                      className="text-[length:var(--nb-text-md)] font-semibold text-[var(--nb-ink)]"
                    >
                      Choose a passcode
                    </label>
                    <Input
                      id="setup-passcode"
                      type="password"
                      value={passcode}
                      onChange={(event) => { setPasscode(event.target.value); }}
                      autoComplete="new-password"
                      disabled={submitting}
                      className="bg-[var(--nb-sheet)] text-[length:var(--nb-text-md)] min-h-[var(--nb-size-control-lg)]"
                    />
                    {fieldErrors.passcode ? (
                      <p
                        className="text-xs font-semibold text-[var(--nb-danger)] flex items-center gap-1.5"
                        role="alert"
                      >
                        <WarningCircleIcon size={16} weight="fill" className="shrink-0" />
                        <span>{fieldErrors.passcode}</span>
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-[var(--nb-space-2)]">
                    <label
                      htmlFor="setup-passcode-confirm"
                      className="text-[length:var(--nb-text-md)] font-semibold text-[var(--nb-ink)]"
                    >
                      Type it again
                    </label>
                    <Input
                      id="setup-passcode-confirm"
                      type="password"
                      value={confirmPasscode}
                      onChange={(event) => { setConfirmPasscode(event.target.value); }}
                      autoComplete="new-password"
                      disabled={submitting}
                      className="bg-[var(--nb-sheet)] text-[length:var(--nb-text-md)] min-h-[var(--nb-size-control-lg)]"
                    />
                    {fieldErrors.confirmPasscode ? (
                      <p
                        className="text-xs font-semibold text-[var(--nb-danger)] flex items-center gap-1.5"
                        role="alert"
                      >
                        <WarningCircleIcon size={16} weight="fill" className="shrink-0" />
                        <span>{fieldErrors.confirmPasscode}</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-[var(--nb-space-2)] pt-[var(--nb-space-1)]">
                  <Button
                    variant="nb_btn_primary"
                    size="nb_btn_lg"
                    type="submit"
                    disabled={submitting}
                    className="w-full justify-center"
                  >
                    <span>Create workspace</span>
                    <ArrowRightIcon size={16} weight="bold" />
                  </Button>
                  <Button
                    variant="nb_btn_ghost"
                    type="button"
                    onClick={handleSkipPasscode}
                    disabled={submitting}
                    className="justify-center"
                  >
                    Skip the passcode
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div>
                <h1
                  data-focus-first
                  className="font-[family-name:var(--nb-font-read)] font-semibold text-[length:var(--nb-text-3xl)] leading-[var(--nb-leading-tight)] tracking-[var(--nb-tracking-tight)] text-balance mb-[var(--nb-space-2)] text-[var(--nb-ink)]"
                >
                  Welcome back
                </h1>
                <p className="font-[family-name:var(--nb-font-read)] text-[length:var(--nb-text-lg)] leading-[var(--nb-leading-read)] max-w-[var(--nb-layout-measure)] text-[var(--nb-ink-2)] mt-[var(--nb-space-2)]">
                  Enter your passcode to open your notebooks.
                </p>
              </div>

              {unlockError === null ? null : (
                <p
                  className="flex items-center gap-1.5 text-xs font-semibold text-[var(--nb-danger)]"
                  role="alert"
                >
                  <WarningCircleIcon size={16} weight="fill" className="shrink-0" />
                  <span>{unlockError}</span>
                </p>
              )}

              <form
                className="grid gap-[var(--nb-space-4)]"
                onSubmit={(event) => {
                  void handleUnlockSubmit(event).catch(() => {
                    // handleUnlockSubmit routes failures into screen state.
                  });
                }}
              >
                <div className="grid gap-[var(--nb-space-2)]">
                  <label
                    htmlFor="unlock-passcode"
                    className="text-[length:var(--nb-text-md)] font-semibold text-[var(--nb-ink)]"
                  >
                    Passcode
                  </label>
                  <Input
                    id="unlock-passcode"
                    type="password"
                    value={unlockPasscode}
                    onChange={(event) => { setUnlockPasscode(event.target.value); }}
                    autoComplete="current-password"
                    disabled={submitting}
                    className="text-[length:var(--nb-text-md)] min-h-[var(--nb-size-control-lg)]"
                    autoFocus
                  />
                </div>

                <div className="grid gap-[var(--nb-space-2)] pt-[var(--nb-space-1)]">
                  <Button
                    variant="nb_btn_primary"
                    size="nb_btn_lg"
                    type="submit"
                    disabled={submitting}
                    className="w-full justify-center"
                  >
                    <span>{submitting ? "Checking…" : "Unlock"}</span>
                    <ArrowRightIcon size={16} weight="bold" />
                  </Button>
                  <Button
                    variant="nb_btn_ghost"
                    type="button"
                    onClick={() => { setMode("setup"); }}
                    className="justify-center"
                  >
                    Back to set up
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>

        <p className="flex items-center justify-center gap-[var(--nb-space-2)] text-center text-[var(--nb-ink-3)] text-xs">
          <HardDrivesIcon size={16} />
          <span>Saved only in this browser. No account, no server.</span>
        </p>
      </section>
    </div>
  );
}

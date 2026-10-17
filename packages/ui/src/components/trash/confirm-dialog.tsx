import * as React from "react";
import type { DeletionLevel } from "@notebook/contracts";
import { Button } from "../primitives/button.js";
import { CheckboxRow } from "../primitives/fields.js";
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../primitives/overlays.js";
import {
  ArrowCounterClockwise,
  Download,
  Trash,
  Warning,
} from "../primitives/icons.js";
import { ReauthField, type ReauthMode } from "./reauth-field.js";
import {
  getDeletionLevel,
  type DeletionLevelDefinition,
} from "../../lib/deletion-levels.js";
import { cn } from "../../lib/utils.js";

export interface ConfirmDialogProps {
  /** Controls open state. */
  open: boolean;
  /** Callback on open state changes. */
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Deletion level (1-6, id 'cache' | 'memory' | ... or DeletionLevelDefinition). */
  level: number | DeletionLevel | DeletionLevelDefinition;
  /** Custom title override. */
  title?: string | undefined;
  /** Custom description/warning override. */
  description?: string | undefined;
  /** Target item name (e.g. notebook title for Level 3). Used in title and confirmation phrase. */
  targetName?: string | undefined;
  /** Custom effect list override. */
  effects?: readonly string[] | undefined;
  /** Whether the system has an owner passcode configured. Governs reauth mode (passcode vs phrase) for Levels 3-6. */
  hasPasscode?: boolean | undefined;
  /** Override reauth mode if needed ("passcode" | "phrase" | "none"). */
  reauthMode?: ReauthMode | "none" | undefined;
  /** Controlled reauth text (passcode or phrase). */
  reauthText?: string | undefined;
  /** Callback for reauth text changes. */
  onReauthTextChange?: ((value: string) => void) | undefined;
  /** Re-auth field error message. */
  reauthError?: string | undefined;
  /** Export backup action (Decision 7.7). When provided, renders the 1-click export backup banner. */
  onExportBackup?: (() => void) | undefined;
  /** Export backup button label. Defaults to "Export Backup (ZIP)". */
  exportBackupLabel?: string | undefined;
  /** When true, confirmation is locked until user exports backup OR checks acknowledgment checkbox (Decision 7.7). */
  requireBackupAcknowledgment?: boolean | undefined;
  /** In-flight deletion state. */
  isPending?: boolean | undefined;
  /** Confirm callback. Receives the typed reauth string if any. */
  onConfirm: (reauth?: string) => void | Promise<void>;
  /** Cancel callback. */
  onCancel?: (() => void) | undefined;
  /** Custom confirm button label. */
  confirmLabel?: string | undefined;
  /** Custom cancel button label. */
  cancelLabel?: string | undefined;
  /** Additional container classes (using var(--nb-*) only). */
  className?: string | undefined;
}

/**
 * ConfirmDialog (ticket 20): Reusable cascading deletion confirmation dialog
 * driven by the single deletion levels table. Provides warning messages, effect lists,
 * export-first offer banners, and re-authentication fields (passcode / typed phrase)
 * matching PRD Decisions 1.42, 6.7, 7.1, 7.7, and 7.9.
 */
const ConfirmDialog = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  ConfirmDialogProps
>(
  (
    {
      open,
      onOpenChange,
      level,
      title,
      description,
      targetName,
      effects,
      hasPasscode = false,
      reauthMode,
      reauthText,
      onReauthTextChange,
      reauthError,
      onExportBackup,
      exportBackupLabel = "Export Backup (ZIP)",
      requireBackupAcknowledgment = false,
      isPending = false,
      onConfirm,
      onCancel,
      confirmLabel,
      cancelLabel = "Cancel",
      className,
      ...props
    },
    ref
  ) => {
    const levelDef = getDeletionLevel(level);

    // Internal reauth text for uncontrolled mode
    const [internalReauthText, setInternalReauthText] = React.useState("");
    const isControlledReauth = reauthText !== undefined;
    const currentReauth = isControlledReauth ? reauthText : internalReauthText;

    const handleReauthChange = (next: string) => {
      if (!isControlledReauth) {
        setInternalReauthText(next);
      }
      onReauthTextChange?.(next);
    };

    // Backup export and acknowledgment states (Decision 7.7)
    const [backupExported, setBackupExported] = React.useState(false);
    const [backupAcknowledged, setBackupAcknowledged] = React.useState(false);

    // Reset internal state when dialog closes
    React.useEffect(() => {
      if (!open) {
        setInternalReauthText("");
        setBackupExported(false);
        setBackupAcknowledged(false);
      }
    }, [open]);

    // Determine effective reauth mode and expected phrase
    const effectiveReauthMode: ReauthMode | "none" = React.useMemo(() => {
      if (reauthMode !== undefined) {
        return reauthMode;
      }
      if (!levelDef.reauth) {
        return "none";
      }
      if (hasPasscode) {
        return "passcode";
      }
      return "phrase";
    }, [reauthMode, levelDef.reauth, hasPasscode]);

    const effectiveExpectedPhrase = React.useMemo(() => {
      if (levelDef.level === 3 && targetName) {
        return targetName;
      }
      return levelDef.phrase ?? "DELETE";
    }, [levelDef.level, levelDef.phrase, targetName]);

    // Validation
    const isReauthValid = React.useMemo(() => {
      if (effectiveReauthMode === "none") {
        return true;
      }
      if (effectiveReauthMode === "passcode") {
        return currentReauth.trim().length > 0;
      }
      if (effectiveReauthMode === "phrase") {
        return currentReauth.trim() === effectiveExpectedPhrase;
      }
      return true;
    }, [effectiveReauthMode, currentReauth, effectiveExpectedPhrase]);

    const isBackupSatisfied = React.useMemo(() => {
      if (!requireBackupAcknowledgment || !onExportBackup) {
        return true;
      }
      return backupExported || backupAcknowledged;
    }, [requireBackupAcknowledgment, onExportBackup, backupExported, backupAcknowledged]);

    const canConfirm = isReauthValid && isBackupSatisfied;

    const displayTitle = title ?? levelDef.name;
    const displayDescription = description ?? levelDef.description;
    const displayEffects = effects ?? levelDef.effects;
    const displayDisclosures = levelDef.disclosures;

    const defaultConfirmLabel =
      confirmLabel ?? (levelDef.risk === "low" ? "Clear" : "Delete");

    // Header icon based on risk
    const renderIcon = () => {
      if (levelDef.risk === "high") {
        return (
          <span className="grid h-[var(--nb-size-control-md)] w-[var(--nb-size-control-md)] place-items-center rounded-[var(--nb-radius-well)] bg-[var(--nb-danger-wash)] text-[var(--nb-danger)]">
            <Warning size={20} weight="fill" aria-hidden="true" />
          </span>
        );
      }
      if (levelDef.risk === "medium") {
        return (
          <span className="grid h-[var(--nb-size-control-md)] w-[var(--nb-size-control-md)] place-items-center rounded-[var(--nb-radius-well)] bg-[var(--nb-warn-wash)] text-[var(--nb-warn)]">
            <Warning size={20} weight="fill" aria-hidden="true" />
          </span>
        );
      }
      return (
        <span className="grid h-[var(--nb-size-control-md)] w-[var(--nb-size-control-md)] place-items-center rounded-[var(--nb-radius-well)] bg-[var(--nb-well)] text-[var(--nb-ink-2)]">
          <ArrowCounterClockwise size={20} aria-hidden="true" />
        </span>
      );
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          ref={ref}
          size="sm"
          aria-describedby={undefined}
          className={cn("max-h-[calc(100%-var(--nb-space-8))] overflow-y-auto", className)}
          {...props}
        >
          <DialogHeader>
            <div className="flex items-center gap-[var(--nb-space-3)]">
              {renderIcon()}
              <div className="grid gap-[var(--nb-space-0-5)]">
                <DialogTitle>{displayTitle}</DialogTitle>
                {targetName ? (
                  <p className="text-[length:var(--nb-text-xs)] font-[number:var(--nb-weight-medium)] text-[var(--nb-ink-2)]">
                    {targetName}
                  </p>
                ) : null}
              </div>
            </div>
            <DialogCloseButton onClick={onCancel} />
          </DialogHeader>

            <DialogBody className="gap-[var(--nb-space-4)]">
              <DialogDescription className="text-[length:var(--nb-text-xs)] text-[var(--nb-ink-2)]">
                {displayDescription}
              </DialogDescription>

              {/* Export-First Offer Banner (Decision 7.7) */}
              {onExportBackup ? (
                <div className="grid gap-[var(--nb-space-2)] rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-3)]">
                  <div className="flex items-center justify-between gap-[var(--nb-space-3)]">
                    <div className="flex items-center gap-[var(--nb-space-2)] text-[length:var(--nb-text-xs)] text-[var(--nb-ink)]">
                      <Download size={16} aria-hidden="true" className="shrink-0 text-[var(--nb-ink-2)]" />
                      <span>Back up your data before deleting.</span>
                    </div>
                    <Button
                      type="button"
                      variant="nb_btn_secondary"
                      size="nb_btn_sm"
                      onClick={() => {
                        setBackupExported(true);
                        onExportBackup();
                      }}
                      leadingIcon={Download}
                    >
                      {exportBackupLabel}
                    </Button>
                  </div>
                  {requireBackupAcknowledgment ? (
                    <CheckboxRow
                      checked={backupAcknowledged}
                      onChange={(checked) => {
                        setBackupAcknowledged(checked);
                      }}
                      className="text-[length:var(--nb-text-xs)]"
                    >
                      I have already backed up this data or do not require an export
                    </CheckboxRow>
                  ) : null}
                </div>
              ) : null}

              {/* Effect List */}
              {displayEffects && displayEffects.length > 0 ? (
                <div className="grid gap-[var(--nb-space-2)] rounded-[var(--nb-radius-control)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-3)]">
                  <p className="text-[length:var(--nb-text-xs)] font-[number:var(--nb-weight-semibold)] text-[var(--nb-ink)]">
                    What will happen:
                  </p>
                  <ul className="grid gap-[var(--nb-space-1)] text-[length:var(--nb-text-xs)] text-[var(--nb-ink-2)]">
                    {displayEffects.map((effect, idx) => (
                      <li key={idx} className="flex items-start gap-[var(--nb-space-2)]">
                        <span className="text-[var(--nb-danger)] font-[number:var(--nb-weight-bold)]">•</span>
                        <span>{effect}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Honest Limits Disclosure (Decision 7.9) */}
              {displayDisclosures && displayDisclosures.length > 0 ? (
                <div className="grid gap-[var(--nb-space-1)] rounded-[var(--nb-radius-control)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-3)] text-[length:var(--nb-text-xs)] text-[var(--nb-ink-2)]">
                  <p className="font-[number:var(--nb-weight-semibold)] text-[var(--nb-ink)]">Honest limits disclosure:</p>
                  {displayDisclosures.map((disclosure, idx) => (
                    <p key={idx}>{disclosure}</p>
                  ))}
                </div>
              ) : null}

              {/* Reauth Field */}
              {effectiveReauthMode !== "none" ? (
                <ReauthField
                  mode={effectiveReauthMode}
                  value={currentReauth}
                  onChange={handleReauthChange}
                  expectedPhrase={effectiveExpectedPhrase}
                  error={reauthError}
                  disabled={isPending}
                />
              ) : null}
            </DialogBody>

            {/* Actions */}
            <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end sm:gap-[var(--nb-space-2)]">
              <Button
                type="button"
                variant="nb_btn_secondary"
                disabled={isPending}
                onClick={() => {
                  onCancel?.();
                  onOpenChange?.(false);
                }}
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                variant="nb_btn_danger"
                disabled={!canConfirm || isPending}
                onClick={() => {
                  void onConfirm(currentReauth);
                }}
                leadingIcon={Trash}
              >
                {isPending ? "Deleting..." : defaultConfirmLabel}
              </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
ConfirmDialog.displayName = "ConfirmDialog";

export { ConfirmDialog };

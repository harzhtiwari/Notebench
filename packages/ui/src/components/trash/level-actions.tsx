import * as React from "react";
import type { DeletionLevel } from "@notebook/contracts";
import { Button } from "../primitives/button.js";
import { Badge } from "../primitives/badges.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import {
  DELETION_LEVELS,
  getDeletionLevel,
  type DeletionLevelDefinition,
  type DeletionRisk,
} from "../../lib/deletion-levels.js";
import { Lock, Warning, ShieldCheck } from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

export interface LevelActionsProps {
  /**
   * Deletion levels to render.
   * Defaults to all DELETION_LEVELS table rows.
   */
  levels?:
    | readonly (number | DeletionLevel | DeletionLevelDefinition)[]
    | undefined;
  /**
   * Export gating state.
   * When false (and gated is true), destructive actions are disabled until export completes.
   */
  exported?: boolean | undefined;
  /** Whether export-first gating is enforced. Defaults to true. */
  gated?: boolean | undefined;
  /** Callback when user clicks a deletion level action button. */
  onSelectLevel?: ((level: DeletionLevelDefinition) => void) | undefined;
  /** Confirm callback when ConfirmDialog executes deletion. */
  onConfirmDeletion?:
    | ((level: DeletionLevelDefinition, reauth?: string) => void | Promise<void>)
    | undefined;
  /** Whether owner passcode is configured for ConfirmDialog re-auth. */
  hasPasscode?: boolean | undefined;
  /** Whether an operation is currently pending. */
  isPending?: boolean | undefined;
  /** Additional container classes (using var(--nb-*) only). */
  className?: string | undefined;
}

function RiskTag({ risk }: { risk: DeletionRisk }): React.JSX.Element {
  if (risk === "low") {
    return (
      <Badge variant="ok" icon={<ShieldCheck size={12} aria-hidden="true" />}>
        Low Risk
      </Badge>
    );
  }
  if (risk === "medium") {
    return (
      <Badge variant="warn" icon={<Warning size={12} aria-hidden="true" />}>
        Medium Risk
      </Badge>
    );
  }
  return (
    <Badge variant="danger" icon={<Warning size={12} aria-hidden="true" />}>
      High Risk
    </Badge>
  );
}

/**
 * LevelActions (Issue 22 / Ticket 23): Cascading deletion level triggers.
 * Driven by the canonical DELETION_LEVELS table and wired to Ticket 20's ConfirmDialog.
 * Enforces PRD K9 export-first gating: buttons disabled until exported: true.
 * Invariant: Never color-alone — risk tags pair colors with explicit icons and text.
 * Invariant: Elevation shadow invariant — zero float shadows on in-page cards.
 */
export function LevelActions({
  levels = DELETION_LEVELS,
  exported = false,
  gated = true,
  onSelectLevel,
  onConfirmDeletion,
  hasPasscode = false,
  isPending = false,
  className,
}: LevelActionsProps): React.JSX.Element {
  const [activeLevel, setActiveLevel] =
    React.useState<DeletionLevelDefinition | null>(null);

  const resolvedLevels = React.useMemo(() => {
    return levels.map((lvl) => getDeletionLevel(lvl));
  }, [levels]);

  const isLocked = gated && !exported;

  const handleActionClick = (levelDef: DeletionLevelDefinition) => {
    if (isLocked) return;
    if (onSelectLevel) {
      onSelectLevel(levelDef);
    }
    setActiveLevel(levelDef);
  };

  return (
    <div className={cn("space-y-[var(--nb-space-3)]", className)}>
      <div className="space-y-[var(--nb-space-3)]">
        {resolvedLevels.map((def) => {
          const isHighRisk = def.risk === "high";

          return (
            <div
              key={def.id}
              className="flex flex-col justify-between gap-[var(--nb-space-4)] rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)] sm:flex-row sm:items-center"
            >
              <div className="space-y-[var(--nb-space-1)]">
                <div className="flex flex-wrap items-center gap-[var(--nb-space-2)]">
                  <span className="font-[family-name:var(--nb-font-mono)] text-[var(--nb-ink-3)] text-[length:var(--nb-text-xs)]">
                    Level {def.level}
                  </span>
                  <h4 className="font-[number:var(--nb-weight-semibold)] text-[var(--nb-ink)] text-[length:var(--nb-text-sm)]">
                    {def.name}
                  </h4>
                  <RiskTag risk={def.risk} />
                </div>
                <p className="text-[var(--nb-ink-2)] text-[length:var(--nb-text-xs)]">
                  {def.description}
                </p>
                {def.effects.length > 0 && (
                  <ul className="mt-[var(--nb-space-1)] list-disc pl-[var(--nb-space-4)] text-[var(--nb-ink-3)] text-[length:var(--nb-text-2xs)]">
                    {def.effects.slice(0, 2).map((effect) => (
                      <li key={effect}>{effect}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="shrink-0">
                <Button
                  type="button"
                  variant={isHighRisk ? "nb_btn_danger" : "nb_btn_secondary"}
                  size="nb_btn_sm"
                  disabled={isLocked || isPending}
                  onClick={() => handleActionClick(def)}
                  title={isLocked ? "Export required before deletion" : def.name}
                  leadingIcon={isLocked ? Lock : undefined}
                >
                  {def.name}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Embedded ConfirmDialog driven by active deletion level */}
      {activeLevel !== null && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setActiveLevel(null);
          }}
          level={activeLevel}
          hasPasscode={hasPasscode}
          isPending={isPending}
          onConfirm={async (reauth) => {
            if (onConfirmDeletion) {
              await onConfirmDeletion(activeLevel, reauth);
            }
            setActiveLevel(null);
          }}
          onCancel={() => setActiveLevel(null)}
        />
      )}
    </div>
  );
}

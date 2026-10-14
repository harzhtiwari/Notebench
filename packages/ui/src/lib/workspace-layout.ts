/**
 * Single source for workspace panel dimensions (ticket 12, Tk 11).
 *
 * Precedence: `token.css` wins over the ticket. Defaults mirror the layout
 * tokens (`--nb-layout-panel-w: 18rem` = 288px,
 * `--nb-layout-panel-w-collapsed: 3.5rem` = 56px at standard root size), so a
 * token change updates this config with it. Min/max, the keyboard step and the
 * storage key have no token; they live here and only here (Tk 11 §5 reuse
 * rule: no literal widths at call sites).
 */
export const workspaceLayout = {
  leftDefault: 288,
  rightDefault: 288,
  collapsedWidth: 56,
  minWidth: 220,
  maxWidth: 420,
  keyboardStep: 16,
  storageKey: "notebench:workspace:layout",
} as const;

/** Clamp a panel width into the ticket range; never NaN, never outside. */
export function clampPanelWidth(width: number): number {
  if (Number.isNaN(width)) return workspaceLayout.leftDefault;
  return Math.max(
    workspaceLayout.minWidth,
    Math.min(workspaceLayout.maxWidth, width)
  );
}

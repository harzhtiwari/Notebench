import { Button } from "./button.js";
import { Warning } from "./icons.js";

export interface NoModelBannerProps {
  onOpenSettings?: ((page?: string) => void) | undefined;
}

export function NoModelBanner({ onOpenSettings }: NoModelBannerProps) {
  return (
    <div
      data-testid="no-model-banner"
      role="alert"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--nb-radius-card)] border border-[var(--nb-warn)]/30 bg-[var(--nb-warn-wash)]/60 px-4 py-3 text-sm text-[var(--nb-ink)]"
    >
      <div className="flex items-center gap-2.5">
        <Warning size={16} weight="fill" className="text-[var(--nb-warn)] shrink-0" />
        <span className="font-semibold text-[var(--nb-warn)]">Attention:</span>
        <span>
          No model configured. Add an API key in{" "}
          <strong className="font-medium">Settings → Models & Keys</strong> to chat with
          your sources.
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        data-testid="configure-model-btn"
        onClick={() => onOpenSettings?.("models")}
        className="h-7 border-[var(--nb-warn)]/40 bg-[var(--nb-sheet)] text-xs font-medium text-[var(--nb-ink)] hover:bg-[var(--nb-ground)]"
      >
        Configure Model →
      </Button>
    </div>
  );
}

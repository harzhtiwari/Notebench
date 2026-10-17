import * as React from "react";
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
import { Button } from "../primitives/button.js";
import { AlertBanner } from "../primitives/banners.js";
import { FileText, resolveIconProps } from "../primitives/icons.js";
import type { StudioToolItem } from "./tool-tile.js";

export interface SourceSummaryItem {
  id: string;
  title: string;
  type?: string | undefined;
}

export interface GenerationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool?: StudioToolItem | null | undefined;
  /** Array of sources, source titles, or count of sources */
  selectedSources?: SourceSummaryItem[] | string[] | number | undefined;
  onGenerate?: (() => void) | undefined;
  isGenerating?: boolean | undefined;
  zeroSourcesWarning?: string | undefined;
  children?: React.ReactNode | undefined;
  className?: string | undefined;
}

/**
 * GenerationModal: dialog summarizing selected sources + Generate action button
 * + zero-sources warning banner (Tickets 07 & 14, PRD Decision 1.9 & E5).
 */
export const GenerationModal: React.FC<GenerationModalProps> = ({
  open,
  onOpenChange,
  tool,
  selectedSources = [],
  onGenerate,
  isGenerating = false,
  zeroSourcesWarning = "Select at least one source to generate an artifact.",
  children,
  className,
}) => {
  const sourcesList: Array<{ id: string; title: string }> = React.useMemo(() => {
    if (Array.isArray(selectedSources)) {
      return selectedSources.map((s, idx) => {
        if (typeof s === "string") {
          return { id: `src-${idx}`, title: s };
        }
        return { id: s.id, title: s.title };
      });
    }
    return [];
  }, [selectedSources]);

  const sourceCount = Array.isArray(selectedSources)
    ? selectedSources.length
    : typeof selectedSources === "number"
    ? selectedSources
    : 0;

  const hasSources = sourceCount > 0;
  const toolTitle = tool?.label ?? "Artifact";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className={className}>
        <DialogHeader>
          <div className="grid min-w-0 gap-[var(--nb-space-1)]">
            <DialogTitle>Generate {toolTitle}</DialogTitle>
            <DialogDescription>
              {tool?.description ??
                "Synthesize your selected notebook sources into a structured deliverable."}
            </DialogDescription>
          </div>
          <DialogCloseButton />
        </DialogHeader>

        <DialogBody className="gap-[var(--nb-space-4)]">
          {!hasSources ? (
            <AlertBanner
              tone="warn"
              title="No sources selected"
              message={zeroSourcesWarning}
            />
          ) : (
            <div className="grid gap-[var(--nb-space-2)]">
              <div className="flex items-center justify-between text-xs font-medium text-[var(--nb-ink-2)]">
                <span>
                  {sourceCount} selected {sourceCount === 1 ? "source" : "sources"}
                </span>
              </div>
              {sourcesList.length > 0 ? (
                <ul className="max-h-[var(--nb-layout-title-min)] overflow-y-auto rounded-[var(--nb-radius-well)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-2)] divide-y divide-[var(--nb-hairline)]">
                  {sourcesList.map((src) => (
                    <li
                      key={src.id}
                      className="flex items-center gap-[var(--nb-space-2)] px-[var(--nb-space-2)] py-[var(--nb-space-1)] text-sm text-[var(--nb-ink)]"
                    >
                      <FileText
                        {...resolveIconProps({ size: "sm" })}
                        className="shrink-0 text-[var(--nb-ink-2)]"
                      />
                      <span className="truncate">{src.title}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          {children}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="nb_btn_ghost"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="nb_btn_primary"
            disabled={!hasSources || isGenerating}
            onClick={onGenerate}
          >
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

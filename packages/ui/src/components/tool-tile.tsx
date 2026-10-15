import * as React from "react";
import type { TargetMilestone } from "@notebook/contracts";
import { VersionBadge } from "./version-badge.js";
import {
  Cards,
  FileText,
  ListChecks,
  Question,
  Slideshow,
  Sparkle,
} from "./icons.js";
import { cn } from "../lib/utils.js";

export type StudioToolStatus = "active" | "roadmap";

export interface StudioToolItem {
  id: string;
  type: string;
  label: string;
  description: string;
  status: StudioToolStatus;
  milestone?: TargetMilestone | "0.2" | "0.3" | "later" | undefined;
  colorVar: string;
}

/**
 * Unified 10-tool artifact catalog definition (NOTEBENCH_0.1 Decision 1.8).
 * 5 active formats (Report, Study Guide, FAQ, Flashcards, Quiz) and
 * 5 roadmap formats (Audio Overview, Slide Deck, Video Overview, Mind Map, Data Table).
 */
export const STUDIO_TOOL_CATALOG: readonly StudioToolItem[] = [
  {
    id: "report",
    type: "report",
    label: "Report",
    description: "Structured briefing and narrative document from sources.",
    status: "active",
    colorVar: "var(--nb-tool-rose)",
  },
  {
    id: "study_guide",
    type: "study_guide",
    label: "Study Guide",
    description: "Key concepts, definitions, and comprehensive review outline.",
    status: "active",
    colorVar: "var(--nb-tool-indigo)",
  },
  {
    id: "faq",
    type: "faq",
    label: "FAQ",
    description: "Frequently asked questions with sourced answers.",
    status: "active",
    colorVar: "var(--nb-tool-purple)",
  },
  {
    id: "flashcards",
    type: "flashcards",
    label: "Flashcards",
    description: "Interactive study cards with spaced recall flip views.",
    status: "active",
    colorVar: "var(--nb-tool-amber)",
  },
  {
    id: "quiz",
    type: "quiz",
    label: "Quiz",
    description: "Practice questions with scoring and instant explanations.",
    status: "active",
    colorVar: "var(--nb-tool-emerald)",
  },
  {
    id: "audio",
    type: "audio",
    label: "Audio Overview",
    description: "Spoken briefing generated directly from your sources.",
    status: "roadmap",
    milestone: "0.2",
    colorVar: "var(--nb-tool-cobalt)",
  },
  {
    id: "deck",
    type: "deck",
    label: "Slide Deck",
    description: "Presentation slide decks with structured visuals.",
    status: "roadmap",
    milestone: "0.2",
    colorVar: "var(--nb-tool-indigo)",
  },
  {
    id: "video",
    type: "video",
    label: "Video Overview",
    description: "Visual walkthrough and generated video overview.",
    status: "roadmap",
    milestone: "0.3",
    colorVar: "var(--nb-tool-teal)",
  },
  {
    id: "mindmap",
    type: "mindmap",
    label: "Mind Map",
    description: "Visual concept graph linking ideas across sources.",
    status: "roadmap",
    milestone: "0.3",
    colorVar: "var(--nb-tool-purple)",
  },
  {
    id: "datatable",
    type: "datatable",
    label: "Data Table",
    description: "Tabular comparisons and quantitative data points.",
    status: "roadmap",
    milestone: "0.3",
    colorVar: "var(--nb-tool-cyan)",
  },
] as const;

export function getActiveTools(): StudioToolItem[] {
  return STUDIO_TOOL_CATALOG.filter((t) => t.status === "active");
}

export function getRoadmapTools(): StudioToolItem[] {
  return STUDIO_TOOL_CATALOG.filter((t) => t.status === "roadmap");
}

export function getStudioTool(idOrType: string): StudioToolItem | undefined {
  return STUDIO_TOOL_CATALOG.find(
    (t) => t.id === idOrType || t.type === idOrType
  );
}

export function getStudioToolIcon(
  typeOrId: string
): React.ComponentType<{
  size?: number | undefined;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
  "aria-hidden"?: boolean | "true" | "false" | undefined;
}> {
  switch (typeOrId) {
    case "report":
      return FileText;
    case "study_guide":
      return ListChecks;
    case "faq":
      return Sparkle;
    case "flashcards":
      return Cards;
    case "quiz":
      return Question;
    case "deck":
    case "slides":
      return Slideshow;
    case "video":
      return Slideshow;
    case "mindmap":
      return Sparkle;
    case "datatable":
    case "timeline":
      return ListChecks;
    case "audio":
    default:
      return Sparkle;
  }
}

export interface ToolTileProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> {
  tool: StudioToolItem;
  badge?: React.ReactNode | undefined;
  icon?: React.ReactNode | undefined;
  onSelect?: ((tool: StudioToolItem) => void) | undefined;
}

const TOOL_COLOR_CLASSES: Record<string, string> = {
  "var(--nb-tool-rose)": "text-[var(--nb-tool-rose)]",
  "var(--nb-tool-indigo)": "text-[var(--nb-tool-indigo)]",
  "var(--nb-tool-purple)": "text-[var(--nb-tool-purple)]",
  "var(--nb-tool-amber)": "text-[var(--nb-tool-amber)]",
  "var(--nb-tool-teal)": "text-[var(--nb-tool-teal)]",
  "var(--nb-tool-cobalt)": "text-[var(--nb-tool-cobalt)]",
  "var(--nb-tool-cyan)": "text-[var(--nb-tool-cyan)]",
  "var(--nb-tool-emerald)": "text-[var(--nb-tool-emerald)]",
};

/**
 * ToolTile: board `.tool` pattern (docs/ui/board.test.html:529-532).
 * Renders an active or roadmap artifact generator tile.
 */
export const ToolTile = React.forwardRef<HTMLButtonElement, ToolTileProps>(
  (
    {
      tool,
      badge,
      icon,
      onSelect,
      className,
      disabled,
      onClick,
      ...props
    },
    ref
  ) => {
    const isRoadmap = tool.status === "roadmap";
    const isDisabled = disabled ?? isRoadmap;
    const IconComponent = getStudioToolIcon(tool.type || tool.id);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
      onSelect?.(tool);
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-disabled={isDisabled ? "true" : undefined}
        onClick={handleClick}
        className={cn(
          "tool flex items-center gap-[var(--nb-space-3)] min-h-[var(--nb-size-control-lg)] px-[var(--nb-space-3)] py-[var(--nb-space-2)] bg-[var(--nb-well)] hover:bg-[var(--nb-well-hover)] text-[var(--nb-ink)] rounded-[var(--nb-radius-well)] font-[var(--nb-font-ui)] text-sm font-medium text-left w-full border-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[var(--nb-well)] focus-visible:outline-none focus-visible:ring-[var(--nb-ring-width)] focus-visible:ring-[var(--nb-focus)] focus-visible:ring-offset-[var(--nb-ring-offset)]",
          className
        )}
        {...props}
      >
        {icon ?? (
          <span
            className={cn(
              "flex shrink-0 items-center justify-center",
              tool.colorVar ? (TOOL_COLOR_CLASSES[tool.colorVar] ?? "text-[var(--nb-ink-2)]") : "text-[var(--nb-ink-2)]"
            )}
          >
            <IconComponent size={20} aria-hidden="true" />
          </span>
        )}
        <span className="truncate">{tool.label}</span>
        {badge !== undefined ? (
          <span className="ml-auto shrink-0">{badge}</span>
        ) : isRoadmap && tool.milestone ? (
          <span className="ml-auto shrink-0">
            <VersionBadge milestone={tool.milestone as TargetMilestone} />
          </span>
        ) : null}
      </button>
    );
  }
);
ToolTile.displayName = "ToolTile";

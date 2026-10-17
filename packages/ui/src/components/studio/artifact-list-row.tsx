import * as React from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  ArrowClockwise,
  CheckCircle,
  resolveIconProps,
  Sparkle,
  Warning,
  WarningCircle,
} from "../primitives/icons.js";
import { Badge, type BadgeVariant } from "../primitives/badges.js";
import { formatRelativeTime } from "../../lib/formatters.js";
import { cn } from "../../lib/utils.js";
import { getStudioToolIcon, STUDIO_TOOL_CATALOG } from "./tool-tile.js";

export type ArtifactLiveStatus =
  | "ready"
  | "generating"
  | "failed"
  | "stale"
  | (string & {});

export interface ArtifactListRowProps
  extends React.HTMLAttributes<HTMLDivElement> {
  id?: string | undefined;
  title: string;
  type: string;
  updatedAt: string | Date | number;
  status: ArtifactLiveStatus;
  statusLabel?: string | undefined;
  onOpen?: ((id?: string) => void) | undefined;
  actions?: React.ReactNode | undefined;
}

function formatTypeBadge(type: string): string {
  const norm = type.toLowerCase().replace(/_/g, "-");
  const tool = STUDIO_TOOL_CATALOG.find(
    (t) => t.id === norm || t.id.replace(/-/g, "_") === type.toLowerCase()
  );
  if (tool) return tool.label;
  if (type.toLowerCase() === "deck" || type.toLowerCase() === "slides") return "Slide Deck";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusConfig {
  icon: PhosphorIcon;
  label: string;
  variant: BadgeVariant;
  spin?: boolean | undefined;
}

function getStatusConfig(
  status: ArtifactLiveStatus,
  customLabel?: string | undefined
): StatusConfig {
  switch (status) {
    case "generating":
      return {
        icon: ArrowClockwise,
        label: customLabel ?? "Generating...",
        variant: "ai",
        spin: true,
      };
    case "ready":
      return {
        icon: CheckCircle,
        label: customLabel ?? "Ready",
        variant: "ok",
      };
    case "failed":
      return {
        icon: WarningCircle,
        label: customLabel ?? "Failed",
        variant: "danger",
      };
    case "stale":
      return {
        icon: Warning,
        label: customLabel ?? "Source changed",
        variant: "warn",
      };
    default:
      return {
        icon: Sparkle,
        label: customLabel ?? String(status),
        variant: "default",
      };
  }
}

/**
 * ArtifactListRow: row displaying artifact title, type badge, relative update time,
 * and live status (board .output pattern).
 * Invariant: Live status pairs an icon and label always — never color alone.
 */
export const ArtifactListRow = React.forwardRef<
  HTMLDivElement,
  ArtifactListRowProps
>(
  (
    {
      id,
      title,
      type,
      updatedAt,
      status,
      statusLabel,
      onOpen,
      actions,
      className,
      onClick,
      ...props
    },
    ref
  ) => {
    const TypeIcon = getStudioToolIcon(type);
    const statusCfg = getStatusConfig(status, statusLabel);
    const StatusIcon = statusCfg.icon;

    const isoString = React.useMemo(() => {
      if (typeof updatedAt === "string") return updatedAt;
      if (typeof updatedAt === "number") return new Date(updatedAt).toISOString();
      return updatedAt.toISOString();
    }, [updatedAt]);

    const relativeTime = React.useMemo(() => {
      try {
        return formatRelativeTime(isoString);
      } catch {
        return "recently";
      }
    }, [isoString]);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(e);
      if (onOpen) {
        onOpen(id);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (onOpen && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onOpen(id);
      }
    };

    const isInteractive = Boolean(onOpen || onClick);

    return (
      <div
        ref={ref}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "output flex items-center gap-[var(--nb-space-3)] px-[var(--nb-space-3)] py-[var(--nb-space-2)] rounded-[var(--nb-radius-well)] hover:bg-[var(--nb-well)] transition-colors duration-[var(--nb-dur-fast)] ease-[var(--nb-ease)] motion-reduce:transition-none text-[var(--nb-ink)] w-full text-left",
          isInteractive && "cursor-pointer focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-solid focus-visible:outline-[var(--nb-focus)] focus-visible:outline-offset-[var(--nb-ring-offset)]",
          className
        )}
        {...props}
      >
        <span className="flex shrink-0 items-center justify-center text-[var(--nb-ink-2)]">
          <TypeIcon size={20} aria-hidden="true" />
        </span>

        <span className="truncate font-medium text-sm text-[var(--nb-ink)] flex-1 min-w-0">
          {title}
        </span>

        <Badge variant="default" className="shrink-0">
          {formatTypeBadge(type)}
        </Badge>

        <time
          dateTime={isoString}
          className="shrink-0 text-xs text-[var(--nb-ink-3)] tabular-nums"
        >
          {relativeTime}
        </time>

        <Badge role="status" variant={statusCfg.variant} className="shrink-0">
          <StatusIcon
            {...resolveIconProps({ size: "sm", weight: "fill" })}
            className={
              statusCfg.spin ? "animate-spin motion-reduce:animate-none" : undefined
            }
          />
          <span>{statusCfg.label}</span>
        </Badge>

        {actions !== undefined ? (
          <div
            className="shrink-0 flex items-center gap-[var(--nb-space-1)]"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </div>
    );
  }
);
ArtifactListRow.displayName = "ArtifactListRow";

import React from "react";
import type { TargetMilestone } from "@notebook/contracts";

interface VersionBadgeProps {
  milestone: TargetMilestone;
  className?: string;
}

export const VersionBadge: React.FC<VersionBadgeProps> = ({ milestone, className = "" }) => {
  const label = milestone === "later" ? "Coming later" : `Coming in ${milestone}`;

  return (
    <span
      data-testid="version-badge"
      className={`inline-flex items-center px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] rounded-[var(--nb-radius-full)] text-[var(--nb-text-2xs)] font-medium bg-[var(--nb-well)] text-[var(--nb-ink-2)] border border-[var(--nb-edge)] select-none ${className}`}
    >
      {label}
    </span>
  );
};

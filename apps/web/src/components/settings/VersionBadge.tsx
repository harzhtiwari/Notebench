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
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 select-none ${className}`}
    >
      {label}
    </span>
  );
};

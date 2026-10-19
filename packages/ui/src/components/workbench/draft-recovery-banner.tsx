import * as React from "react";

import { Banner } from "../primitives/index.js";
import { ClockCounterClockwiseIcon } from "../primitives/icons.js";

export interface DraftRecoveryBannerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  draftTimestamp?: string | Date | undefined;
  title?: string | undefined;
  message?: string | undefined;
  onRecover: () => void;
  onDiscard: () => void;
  recoverLabel?: string | undefined;
  discardLabel?: string | undefined;
}

/**
Draft recovery offer banner (issue 15, Decision 4.4).
Appears when an uncommitted local draft is detected on reload.
Composed on the unified Banner primitive (warn tone, clock lead icon).
*/
export const DraftRecoveryBanner = React.forwardRef<
  HTMLDivElement,
  DraftRecoveryBannerProps
>(
  (
    {
      className,
      draftTimestamp,
      title = "Unsaved draft found",
      message,
      onRecover,
      onDiscard,
      recoverLabel = "Restore draft",
      discardLabel = "Discard",
      ...props
    },
    ref
  ) => {
    const formattedTime =
      draftTimestamp instanceof Date
        ? draftTimestamp.toLocaleTimeString()
        : draftTimestamp;

    const defaultMessage = formattedTime
      ? `A newer uncommitted draft from ${formattedTime} was found. Would you like to restore it?`
      : "A newer uncommitted draft was found. Would you like to restore it?";

    return (
      <Banner
        ref={ref}
        tone="warn"
        role="alert"
        title={title}
        message={message ?? defaultMessage}
        icon={
          <ClockCounterClockwiseIcon
            size={20}
            weight="fill"
            aria-hidden="true"
            className="text-[var(--nb-warn)]"
          />
        }
        actionLabel={recoverLabel}
        onAction={onRecover}
        secondaryActionLabel={discardLabel}
        onSecondaryAction={onDiscard}
        className={className}
        {...props}
      />
    );
  }
);

DraftRecoveryBanner.displayName = "DraftRecoveryBanner";

"use client";
import * as React from "react";

import { Button, IconButton } from "./button.js";
import { CheckCircleIcon, WarningIcon, WarningCircleIcon, XIcon } from "./icons.js";
import { cn } from "../../lib/utils.js";

export type ToastTone = "neutral" | "ok" | "warn" | "error";

export interface ToastData {
  id: string;
  message: React.ReactNode;
  tone?: ToastTone | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  /**
  Auto-dismiss delay in milliseconds. Defaults to 5000 (0 = sticky).
  */
  duration?: number | undefined;
  role?: "status" | "alert" | undefined;
}

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
  The message text or node displayed in the toast.
  */
  message: React.ReactNode;
  /**
  Optional visual status indicator icon.
  */
  tone?: ToastTone | undefined;
  /**
  Optional single action label (e.g. "Undo", "Retry").
  */
  actionLabel?: string | undefined;
  /**
  Callback fired when the action button is clicked.
  */
  onAction?: (() => void) | undefined;
  /**
  Callback fired when the toast is dismissed.
  */
  onDismiss?: (() => void) | undefined;
  /**
  Accessible dismiss button label. Defaults to "Dismiss".
  */
  dismissLabel?: string | undefined;
  /**
  Show close button. Defaults to false when actionLabel is present.
  */
  showClose?: boolean | undefined;
}

export interface ToastViewportProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
  Alignment on screen. Defaults to "bottom-center".
  */
  placement?: "bottom-center" | "bottom-right" | "top-center" | undefined;
}

const DEFAULT_TOAST_DURATION_MS = 5000;

/**
Board `.toast` pill: inverted ink, control radius, float elevation (board.test.html#L590).
*/
const TOAST_CONTAINER_CLASS = cn(
  "toast pointer-events-auto inline-flex flex-wrap items-center gap-[var(--nb-space-3)]",
  "rounded-[var(--nb-radius-control)] bg-[var(--nb-ink)] text-[var(--nb-ink-inv)]",
  "py-[var(--nb-space-2)] pr-[var(--nb-space-2)] pl-[var(--nb-space-5)]",
  "shadow-[var(--nb-shadow-float)] text-[length:var(--nb-text-sm)] leading-[var(--nb-leading-ui)]",
  "transition-all duration-[var(--nb-dur-base)] ease-[var(--nb-ease)] motion-reduce:transition-none"
);

/**
Inverse-ink action styling inside the toast (board.test.html#L591-593).
*/
const TOAST_ACTION_BUTTON_CLASS = cn(
  "shrink-0 text-[var(--nb-ink-inv)]",
  "hover:bg-transparent hover:underline",
  "focus-visible:outline-[var(--nb-ink-inv)] focus-visible:outline-offset-[var(--nb-ring-offset)]"
);

const TOAST_CLOSE_BUTTON_CLASS = cn(
  "shrink-0 text-[var(--nb-ink-inv)]",
  "hover:bg-transparent",
  "focus-visible:outline-[var(--nb-ink-inv)] focus-visible:outline-offset-[var(--nb-ring-offset)]"
);

/**
Tone glyphs are never color-alone; they keep the inverse ink for contrast on `--nb-ink`.
*/
function toastToneIcon(tone: ToastTone): React.ReactElement | null {
  const className = "shrink-0 text-[var(--nb-ink-inv)]";

  switch (tone) {
    case "ok": {
      return <CheckCircleIcon size={20} weight="fill" aria-hidden="true" className={className} />;
    }
    case "warn": {
      return <WarningIcon size={20} weight="fill" aria-hidden="true" className={className} />;
    }
    case "error": {
      return (
        <WarningCircleIcon size={20} weight="fill" aria-hidden="true" className={className} />
      );
    }
    default: {
      return null;
    }
  }
}

interface ToastTimerEntry {
  handle: ReturnType<typeof setTimeout> | undefined;
  startedAt: number;
  remaining: number;
}

const toastState: { toasts: ToastData[]; sequence: number } = {
  toasts: [],
  sequence: 0,
};
const listeners = new Set<() => void>();
const timers = new Map<string, ToastTimerEntry>();

function emit(next: ToastData[]): void {
  toastState.toasts = next;
  for (const listener of listeners) {
    listener();
  }
}

function scheduleTimer(id: string, ms: number): void {
  const handle = setTimeout(() => {
    timers.delete(id);
    dismiss(id);
  }, ms);
  timers.set(id, { handle, startedAt: Date.now(), remaining: ms });
}

function clearTimer(id: string): void {
  const entry = timers.get(id);
  if (entry?.handle !== undefined) {
    clearTimeout(entry.handle);
  }
  timers.delete(id);
}

function show(data: Omit<ToastData, "id"> & { id?: string | undefined }): string {
  toastState.sequence += 1;
  const id = data.id ?? `toast-${toastState.sequence}`;
  const duration = data.duration ?? DEFAULT_TOAST_DURATION_MS;
  const next: ToastData = { ...data, id, duration };

  emit([...toastState.toasts, next]);
  if (duration > 0) {
    scheduleTimer(id, duration);
  }
  return id;
}

function dismiss(id: string): void {
  clearTimer(id);
  if (toastState.toasts.some((item) => item.id === id)) {
    emit(toastState.toasts.filter((item) => item.id !== id));
  }
}

function clear(): void {
  for (const id of timers.keys()) {
    clearTimer(id);
  }
  if (toastState.toasts.length > 0) {
    emit([]);
  }
}

/**
Pauses the auto-dismiss countdown, keeping the unspent time for `resume`.
*/
function pause(id: string): void {
  const entry = timers.get(id);
  if (entry?.handle === undefined) {
    return;
  }
  clearTimeout(entry.handle);
  entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
  entry.handle = undefined;
}

/**
Resumes a paused auto-dismiss countdown from the unspent time.
*/
function resume(id: string): void {
  const entry = timers.get(id);
  if (entry === undefined || entry.handle !== undefined) {
    return;
  }
  entry.startedAt = Date.now();
  entry.handle = setTimeout(() => {
    timers.delete(id);
    dismiss(id);
  }, entry.remaining);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ToastData[] {
  return toastState.toasts;
}

/**
Headless toast manager. Pure observable store: `show` returns the toast id and
schedules the auto-dismiss countdown; `pause` / `resume` freeze and restart it.
*/
export const toast = {
  show,
  dismiss,
  clear,
  pause,
  resume,
  subscribe,
  getSnapshot,
} as const;

/**
React binding for the toast store. Returns the live toast list plus the
manager actions; wire `onMouseEnter`/`onFocus` to `pause` and
`onMouseLeave`/`onBlur` to `resume` where the toasts are rendered.
*/
export function useToast(): {
  toasts: ToastData[];
  show: typeof toast.show;
  dismiss: typeof toast.dismiss;
  clear: typeof toast.clear;
  pause: typeof toast.pause;
  resume: typeof toast.resume;
} {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    toasts: snapshot,
    show: toast.show,
    dismiss: toast.dismiss,
    clear: toast.clear,
    pause: toast.pause,
    resume: toast.resume,
  };
}

export const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  (
    {
      message,
      tone = "neutral",
      actionLabel,
      onAction,
      onDismiss,
      dismissLabel = "Dismiss",
      showClose,
      role,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const hasAction = actionLabel !== undefined && onAction !== undefined;
    const resolvedRole = role ?? (tone === "error" ? "alert" : "status");
    const resolvedLive = resolvedRole === "alert" ? "assertive" : "polite";
    const isWithClose = onDismiss !== undefined && (showClose ?? !hasAction);

    return (
      <div
        ref={ref}
        role={resolvedRole}
        aria-live={resolvedLive}
        className={cn(TOAST_CONTAINER_CLASS, className)}
        {...props}
      >
        {toastToneIcon(tone)}
        <span className="min-w-0">{message}</span>
        {hasAction ? (
          <Button
            variant="nb_btn_ghost"
            size="nb_btn_sm"
            type="button"
            onClick={onAction}
            className={TOAST_ACTION_BUTTON_CLASS}
          >
            {actionLabel}
          </Button>
        ) : null}
        {isWithClose ? (
          <IconButton
            variant="nb_btn_ghost"
            size="nb_btn_icon_sm"
            icon={XIcon}
            aria-label={dismissLabel}
            onClick={onDismiss}
            className={TOAST_CLOSE_BUTTON_CLASS}
          />
        ) : null}
        {children}
      </div>
    );
  }
);
Toast.displayName = "Toast";

const PLACEMENT_CLASS: Record<
  NonNullable<ToastViewportProps["placement"]>,
  string
> = {
  "bottom-center": "inset-x-0 bottom-0 items-center",
  "bottom-right": "bottom-0 right-0 items-end",
  "top-center": "inset-x-0 top-0 items-center",
};

/**
Fixed aria-live region at `--nb-z-toast` (60) that hosts floating toasts.
*/
export const ToastViewport = React.forwardRef<HTMLDivElement, ToastViewportProps>(
  ({ placement = "bottom-center", className, children, ...props }, ref) => (
    <div
      ref={ref}
      data-placement={placement}
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed z-[var(--nb-z-toast)] flex flex-col gap-[var(--nb-space-2)] p-[var(--nb-space-4)]",
        PLACEMENT_CLASS[placement],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
ToastViewport.displayName = "ToastViewport";

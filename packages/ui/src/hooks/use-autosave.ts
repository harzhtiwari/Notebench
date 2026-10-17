import * as React from "react";
import {
  autosavePolicy,
  type AutosavePolicy,
  type AutosaveStatus,
} from "../lib/autosave-policy.js";

export interface UseAutosaveOptions<T> {
  value: T;
  onSaveDraft?: ((value: T) => void | Promise<void>) | undefined;
  onCommit: (value: T) => void | Promise<void>;
  policy?: AutosavePolicy | undefined;
  isEqual?: ((a: T, b: T) => boolean) | undefined;
}

export interface UseAutosaveResult {
  status: AutosaveStatus;
  isDirty: boolean;
  commit: () => Promise<void>;
  flushDraft: () => Promise<void>;
  retry: () => Promise<void>;
  error: Error | null;
}

const defaultIsEqual = <T>(a: T, b: T): boolean => a === b;

export function useAutosave<T>({
  value,
  onSaveDraft,
  onCommit,
  policy = autosavePolicy,
  isEqual = defaultIsEqual,
}: UseAutosaveOptions<T>): UseAutosaveResult {
  const [status, setStatus] = React.useState<AutosaveStatus>("idle");
  const [error, setError] = React.useState<Error | null>(null);

  const valueRef = React.useRef<T>(value);
  valueRef.current = value;

  const prevValueRef = React.useRef<T>(value);
  const lastCommittedRef = React.useRef<T>(value);
  const isDirtyRef = React.useRef<boolean>(false);

  const onSaveDraftRef = React.useRef(onSaveDraft);
  onSaveDraftRef.current = onSaveDraft;

  const onCommitRef = React.useRef(onCommit);
  onCommitRef.current = onCommit;

  const isEqualRef = React.useRef(isEqual);
  isEqualRef.current = isEqual;

  const draftTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const quietTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const ceilingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = React.useCallback(() => {
    if (draftTimerRef.current !== null) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (quietTimerRef.current !== null) {
      clearTimeout(quietTimerRef.current);
      quietTimerRef.current = null;
    }
    if (ceilingTimerRef.current !== null) {
      clearTimeout(ceilingTimerRef.current);
      ceilingTimerRef.current = null;
    }
  }, []);

  const doCommit = React.useCallback(async (targetValue: T) => {
    clearTimers();
    setStatus("saving");
    setError(null);
    try {
      await onCommitRef.current(targetValue);
      lastCommittedRef.current = targetValue;
      isDirtyRef.current = false;
      setStatus("saved");
    } catch (err) {
      const parsedError = err instanceof Error ? err : new Error(String(err));
      setError(parsedError);
      setStatus("error");
    }
  }, [clearTimers]);

  const commit = React.useCallback(async () => {
    if (!isDirtyRef.current) return;
    await doCommit(valueRef.current);
  }, [doCommit]);

  const flushDraft = React.useCallback(async () => {
    if (draftTimerRef.current !== null) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (onSaveDraftRef.current !== undefined) {
      await onSaveDraftRef.current(valueRef.current);
    }
  }, []);

  const retry = React.useCallback(async () => {
    await doCommit(valueRef.current);
  }, [doCommit]);

  // Effect to detect actual value changes
  React.useEffect(() => {
    // If value has not changed since previous cycle, do not re-trigger drafting
    if (isEqualRef.current(value, prevValueRef.current)) {
      return;
    }
    prevValueRef.current = value;

    // If identical to last committed value, clear dirty state
    if (isEqualRef.current(value, lastCommittedRef.current)) {
      isDirtyRef.current = false;
      setStatus("saved");
      clearTimers();
      return;
    }

    isDirtyRef.current = true;
    setStatus("drafting");

    // Tier 1: Draft timer (300ms debounce)
    if (draftTimerRef.current !== null) {
      clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null;
      if (onSaveDraftRef.current !== undefined) {
        void onSaveDraftRef.current(valueRef.current);
      }
    }, policy.draftDebounceMs);

    // Tier 2a: Quiet window timer (2,000ms pause)
    if (quietTimerRef.current !== null) {
      clearTimeout(quietTimerRef.current);
    }
    quietTimerRef.current = setTimeout(() => {
      quietTimerRef.current = null;
      void doCommit(valueRef.current);
    }, policy.commitQuietMs);

    // Tier 2b: Hard ceiling timer (30,000ms unbroken)
    if (ceilingTimerRef.current === null) {
      ceilingTimerRef.current = setTimeout(() => {
        ceilingTimerRef.current = null;
        void doCommit(valueRef.current);
      }, policy.commitCeilingMs);
    }
  }, [value, policy.draftDebounceMs, policy.commitQuietMs, policy.commitCeilingMs, clearTimers, doCommit]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return {
    status,
    isDirty: isDirtyRef.current,
    commit,
    flushDraft,
    retry,
    error,
  };
}

import * as React from "react";

/**
Whole seconds remaining until `targetMs` (epoch milliseconds), clamped at
zero. Ticks once per second and cleans up its interval on unmount or when
the target changes. Purely presentational: lockout policy (attempt counts,
window lengths) lives server-side; callers pass the authoritative target.
*/
export function useCountdown(targetMs: number): number {
  const remainingOf = (now: number): number =>
    Math.max(0, Math.ceil((targetMs - now) / 1000));
  const [remaining, setRemaining] = React.useState(() =>
    remainingOf(Date.now())
  );

  React.useEffect(() => {
    setRemaining(remainingOf(Date.now()));
    if (targetMs <= Date.now()) {
      return;
    }
    const id = setInterval(() => {
      setRemaining(remainingOf(Date.now()));
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [targetMs]);

  return remaining;
}

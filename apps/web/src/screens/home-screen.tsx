"use client";

import { RouteStub } from "./route-stub";

// Merged from apps/web/src/app/page.tsx (ticket 06): home screen body reused,
// not duplicated. Route entry now lives at app/[[...slug]]/page.tsx.
export function HomeScreen() {
  return (
    <RouteStub
      testId="route-stub-home"
      title="Dashboard removed"
      description="Rebuilt under ticket 05 from @notebook/ui primitives."
    />
  );
}

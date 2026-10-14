"use client";

import { Well, WellTitle, WellDescription } from "@notebook/ui";

// Shared stub shell for the merged ticket-05 placeholder screens: one shape,
// used by both home and dashboard entries until the real screens land.
export function RouteStub({
  testId,
  title,
  description,
}: {
  testId: string;
  title: string;
  description: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-screen items-center justify-center bg-[var(--nb-ground)] p-4"
    >
      <Well className="max-w-md p-6 text-center">
        <WellTitle>{title}</WellTitle>
        <WellDescription>{description}</WellDescription>
      </Well>
    </div>
  );
}

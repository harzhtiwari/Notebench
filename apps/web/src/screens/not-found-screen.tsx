"use client";

import { Well, WellTitle, WellDescription } from "@notebook/ui";

// Deep-link shell (ticket 06): unknown client routes render a valid shell
// instead of a document reload or a server 404 page.
export function NotFoundScreen({ path }: { path: string }) {
  return (
    <div
      data-testid="route-not-found"
      className="flex min-h-screen items-center justify-center bg-[var(--nb-ground)] p-4"
    >
      <Well className="max-w-md p-6 text-center">
        <WellTitle>Route not found</WellTitle>
        <WellDescription>No screen is registered for {path}.</WellDescription>
      </Well>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  createMemoryRouter,
  parseRoute,
  resolveAppPath,
  shouldInterceptNavigation,
  type ScreenId,
} from "../lib/router";
import { resolveScreen } from "../lib/screens";
import { HomeScreen } from "../screens/home-screen";
import { DashboardScreen } from "../screens/dashboard-screen";
import { SetupScreen } from "../screens/setup-screen";
import { NotFoundScreen } from "../screens/not-found-screen";

function liveUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * Persistent client root (ticket 06). Shared shell state lives here, above the
 * screen boundary, so switching screens never remounts it. In-shell link
 * clicks that the owned router claims become `history.pushState` updates —
 * no document request, no per-page compilation round-trip. Native back/forward
 * flows back through `popstate` into the same router.
 */
export function AppRoot({ initialPath }: { initialPath: string }) {
  const router = useMemo(() => createMemoryRouter(initialPath), []);
  const [entry, setEntry] = useState(router.current);
  // Stable app-mounted marker (warm-up probe): flipped only after real
  // mount. Navigation-critical screens load eagerly (see lib/screens), so a
  // mounted shell means their preload completed — the probe never mistakes
  // server-rendered HTML for a live app.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => router.subscribe(setEntry), [router]);

  // Router → URL bar: every owned navigation is a pushState, never a reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    return router.subscribe((next) => {
      const url = `${next.path}${next.search}${next.hash}`;
      if (url !== liveUrl()) window.history.pushState(null, "", url);
    });
  }, [router]);

  // URL bar → router: native back/forward lands here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = (): void => {
      router.navigate(liveUrl());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [router]);

  // Mount correction, once: the Fastify static fallback serves index.html for
  // unknown deep links (prerendered prop "/") and the server never sees the
  // hash, so adopt the live URL when it carries more than the prop did.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prop = parseRoute(initialPath);
    const url = liveUrl();
    const current = parseRoute(url);
    if (prop.path === "/" && current.path !== "/") router.navigate(url);
    else if (current.path === prop.path && url !== initialPath) router.navigate(url);
  }, [router, initialPath]);

  function handleShellClick(event: ReactMouseEvent<HTMLElement>): void {
    const anchor = (event.target as HTMLElement | null)?.closest?.("a");
    if (anchor === null || anchor === undefined) return;
    const href = anchor.getAttribute("href");
    if (href === null) return;
    const target = resolveAppPath(href, entry.path);
    if (target === null) return;
    if (
      !shouldInterceptNavigation({
        href: target,
        target: anchor.getAttribute("target") ?? undefined,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        download: anchor.hasAttribute("download"),
      })
    ) {
      return;
    }
    event.preventDefault();
    router.navigate(target);
  }

  const screen = resolveScreen(`${entry.path}${entry.search}${entry.hash}`);
  const screens: Record<ScreenId, React.JSX.Element> = {
    home: <HomeScreen />,
    dashboard: <DashboardScreen />,
    setup: <SetupScreen navigate={(to) => router.navigate(to)} />,
    "not-found": <NotFoundScreen path={entry.path} />,
  };

  return (
    <div
      data-testid="app-shell"
      data-app-mounted={mounted ? "true" : "false"}
      onClickCapture={handleShellClick}
    >
      <nav>
        <a href="/">Home</a>
        <a href="/dashboard">Dashboard</a>
        <a href="/setup">Setup</a>
      </nav>
      {screens[screen]}
    </div>
  );
}

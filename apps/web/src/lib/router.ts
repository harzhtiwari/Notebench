export type ScreenId = "home" | "dashboard" | "setup" | "not-found";

export interface ParsedRoute {
  screen: ScreenId;
  slug: Array<string>;
  path: string;
  search: string;
  hash: string;
}

function splitPath(input: string): { path: string; search: string; hash: string } {
  let rest = input;
  let hash = "";
  let search = "";
  const hashIndex = rest.indexOf("#");
  if (hashIndex >= 0) {
    hash = rest.slice(hashIndex);
    rest = rest.slice(0, hashIndex);
  }
  const searchIndex = rest.indexOf("?");
  if (searchIndex >= 0) {
    search = rest.slice(searchIndex);
    rest = rest.slice(0, searchIndex);
  }
  return { path: rest === "" ? "/" : rest, search, hash };
}

function normalizePathname(path: string): string {
  if (path === "") return "/";
  const withLeading = path.startsWith("/") ? path : `/${path}`;
  if (withLeading.length > 1 && withLeading.endsWith("/")) {
    return withLeading.slice(0, -1);
  }
  return withLeading;
}

const PATH_SCREENS: Record<string, ScreenId> = {
  "/": "home",
  "/dashboard": "dashboard",
  "/setup": "setup",
};

export function parseRoute(input: string): ParsedRoute {
  const { path, search, hash } = splitPath(input);
  const pathname = normalizePathname(path);
  const slug = pathname === "/" ? [] : pathname.slice(1).split("/");
  const screen: ScreenId = PATH_SCREENS[pathname] ?? "not-found";
  return { screen, slug, path: pathname, search, hash };
}

export interface ClickIntent {
  href: string;
  target?: string | undefined;
  button?: number | undefined;
  metaKey?: boolean | undefined;
  ctrlKey?: boolean | undefined;
  shiftKey?: boolean | undefined;
  altKey?: boolean | undefined;
  download?: boolean | string | undefined;
  currentPath?: string | undefined;
}

/**
 * Resolves an in-shell link to the app-absolute URL the owned router would
 * serve, or null when the link stays browser-native: external URLs, pure
 * same-screen hash anchors (the browser scrolls without a document request),
 * and anything outside the app path space. Relative hrefs resolve against the
 * current path, so in-shell links never fall through to a document reload.
 */
export function resolveAppPath(href: string, currentPath: string): string | null {
  if (href.startsWith("#")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) return null;
  if (href.startsWith("//")) return null;
  const current = parseRoute(currentPath === "" ? "/" : currentPath);
  const currentBase = `http://app.local${current.path}${current.search}`;
  const resolved = new URL(href, currentBase);
  const path = normalizePathname(resolved.pathname);
  const currentFull = `${current.path}${current.search}`;
  const resolvedHead = `${path}${resolved.search}`;
  if (resolvedHead === currentFull && resolved.hash !== "") return null;
  return `${path}${resolved.search}${resolved.hash}`;
}

export function shouldInterceptNavigation(intent: ClickIntent): boolean {
  const target = resolveAppPath(intent.href, intent.currentPath ?? "/");
  if (target === null) return false;
  if (intent.target === "_blank") return false;
  if (intent.download === true || typeof intent.download === "string") return false;
  if (intent.metaKey === true || intent.ctrlKey === true) return false;
  if (intent.shiftKey === true || intent.altKey === true) return false;
  if (intent.button !== undefined && intent.button !== 0) return false;
  return true;
}

interface RouterEntry {
  path: string;
  search: string;
  hash: string;
}

export interface MemoryRouter {
  readonly current: RouterEntry;
  readonly reloads: number;
  navigate: (to: string) => void;
  back: () => void;
  forward: () => void;
  subscribe: (listener: (entry: RouterEntry) => void) => () => void;
}

export function createMemoryRouter(initialPath: string): MemoryRouter {
  const initial = parseRoute(initialPath);
  const entries: Array<RouterEntry> = [
    { path: initial.path, search: initial.search, hash: initial.hash },
  ];
  let index = 0;
  const listeners = new Set<(entry: RouterEntry) => void>();

  function notify(): void {
    const entry = entries[index] as RouterEntry;
    for (const listener of listeners) listener(entry);
  }

  return {
    get current(): RouterEntry {
      return entries[index] as RouterEntry;
    },
    reloads: 0,
    navigate(to: string): void {
      const parsed = parseRoute(to);
      entries.splice(index + 1);
      entries.push({ path: parsed.path, search: parsed.search, hash: parsed.hash });
      index = entries.length - 1;
      notify();
    },
    back(): void {
      if (index > 0) {
        index -= 1;
        notify();
      }
    },
    forward(): void {
      if (index < entries.length - 1) {
        index += 1;
        notify();
      }
    },
    subscribe(listener: (entry: RouterEntry) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

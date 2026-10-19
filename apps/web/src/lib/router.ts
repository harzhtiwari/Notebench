export type ScreenId = "setup" | "login" | "health" | "dashboard" | "notebook" | "trash" | "models" | "ui-preview" | "not-found";

export interface ParsedRoute {
  screen: ScreenId;
  slug: string[];
  path: string;
  search: string;
  hash: string;
}

function splitPath(input: string): { path: string; search: string; hash: string } {
  let rest = input;
  let hash = "";
  let search = "";
  const hashIndex = rest.indexOf("#");
  if (hashIndex !== -1) {
    hash = rest.slice(hashIndex);
    rest = rest.slice(0, hashIndex);
  }
  const searchIndex = rest.indexOf("?");
  if (searchIndex !== -1) {
    search = rest.slice(searchIndex);
    rest = rest.slice(0, searchIndex);
  }
  return { path: rest === "" ? "/" : rest, search, hash };
}

function normalizePathname(path: string): string {
  if (path === "") return "/";
  const withLeading = path.startsWith("/") ? path : `/${path}`;
  return withLeading.length > 1 && withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}

const PATH_SCREENS: Record<string, ScreenId> = {
  "/setup": "setup",
  "/login": "login",
  "/health": "health",
  "/dashboard": "dashboard",
  "/notebooks": "dashboard",
  "/trash": "trash",
  "/settings/models": "models",
  "/ui-preview": "ui-preview",
};

function matchNotebookRoute(pathname: string): ScreenId | null {
  if (pathname.startsWith("/notebooks/") && pathname.length > "/notebooks/".length) {
    const rest = pathname.slice("/notebooks/".length);
    if (rest.length > 0 && !rest.includes("/")) return "notebook";
  }
  return null;
}

export function parseRoute(input: string): ParsedRoute {
  const { path, search, hash } = splitPath(input);
  const pathname = normalizePathname(path);
  const slug = pathname === "/" ? [] : pathname.slice(1).split("/");
  const screen: ScreenId = PATH_SCREENS[pathname] ?? matchNotebookRoute(pathname) ?? "not-found";
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
Resolves an in-shell link to the app-absolute URL the owned router would
serve, or null when the link stays browser-native: external URLs, pure
same-screen hash anchors (the browser scrolls without a document request),
and anything outside the app path space. Relative hrefs resolve against the
current path, so in-shell links never fall through to a document reload.
*/
export function resolveAppPath(href: string, currentPath: string): string | null {
  if (href.startsWith("#") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) || href.startsWith("//")) return null;
  const current = parseRoute(currentPath === "" ? "/" : currentPath);
  const currentBase = `https://app.local${current.path}${current.search}`;
  const resolved = new URL(href, currentBase);
  const path = normalizePathname(resolved.pathname);
  const currentFull = `${current.path}${current.search}`;
  const resolvedHead = `${path}${resolved.search}`;
  return resolvedHead === currentFull && resolved.hash !== "" ? null : `${path}${resolved.search}${resolved.hash}`;
}

export function shouldInterceptNavigation(intent: ClickIntent): boolean {
  const target = resolveAppPath(intent.href, intent.currentPath ?? "/");
  if ((target === null) || (intent.target === "_blank") || intent.download === true || typeof intent.download === "string" || intent.metaKey === true || intent.ctrlKey === true || intent.shiftKey === true || intent.altKey === true) return false;
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
  const entries: RouterEntry[] = [
    { path: initial.path, search: initial.search, hash: initial.hash },
  ];
  let index = 0;
  const listeners = new Set<(entry: RouterEntry) => void>();

  function currentEntry(): RouterEntry {
    const entry = entries[index];
    if (entry === undefined) {
      throw new Error("Router history index is out of bounds.");
    }
    return entry;
  }

  function notify(): void {
    const entry = currentEntry();
    for (const listener of listeners) listener(entry);
  }

  return {
    get current(): RouterEntry {
      return currentEntry();
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
      if (!(index > 0)) {
        return;
      }

      index -= 1;
      notify();
    },
    forward(): void {
      if (!(index < entries.length - 1)) {
        return;
      }

      index += 1;
      notify();
    },
    subscribe(listener: (entry: RouterEntry) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

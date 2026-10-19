/**
Pre-paint theme boot. The static HTML <head> must put the stored theme on
<html> BEFORE the first paint, or dark-mode users see a light flash on every
hard load. The root layout (a Server Component) inlines this script via
dangerouslySetInnerHTML, so this module MUST stay server-safe: no "use
client" here, and no imports from the client-only @notebench/ui entry (Next
forbids calling functions of a client module from the server).

Resolution order mirrors @notebench/ui applyTheme(): a stored "light" or
"dark" wins; anything else follows the OS preference. The storage key is
pinned to @notebench/ui's theme runtime behaviorally by theme-boot.test.ts
(applyTheme/getStoredTheme round-trips), so the two cannot drift silently.

ThemeWatcher re-applies the same resolution during hydration (covers the
dev remount and OS appearance changes); this script is what kills the flash.
*/
export const THEME_STORAGE_KEY = "notebench_theme";

/**
ES5-only on purpose: it runs during HTML parsing, before any bundle.
*/
export function buildThemeBootScript(): string {
  return (
    "(function(){try{" +
    `var t=null;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}` +
    'if(t!=="light"&&t!=="dark"){' +
    't=typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"' +
    "}" +
    'var d=document.documentElement;d.setAttribute("data-theme",t);' +
    'if(t==="dark"){d.classList.add("dark")}else{d.classList.remove("dark")}' +
    "}catch(e){}})()"
  );
}

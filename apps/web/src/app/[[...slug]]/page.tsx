import { AppRoot } from "../../shell/app-root";

/**
Single catch-all entry. The removed stub screens (`/`, `/dashboard`) are
not prerendered. The empty slug emits the root shell as `out/index.html`;
the daemon fallback serves it for unknown non-API paths (deep links adopt
the live URL on mount). `/setup` keeps its baked first paint.
*/
export function generateStaticParams(): { slug: string[] }[] {
  return [{ slug: [] }, { slug: ["setup"] }, { slug: ["ui-preview"] }];
}

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<React.JSX.Element> {
  const { slug } = await params;
  const initialPath = slug === undefined || slug.length === 0 ? "/" : `/${slug.join("/")}`;
  return <AppRoot initialPath={initialPath} />;
}
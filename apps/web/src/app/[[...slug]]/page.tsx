import { AppRoot } from "../../shell/app-root";

/**
 * Single catch-all entry (ticket 06). The previous separate page entries
 * (`/`, `/dashboard`, `/setup`) are merged here, not duplicated. The server
 * bakes only the path (static export cannot read the query); AppRoot adopts
 * the live query and hash on mount, so refresh preserves them client-side.
 */
export function generateStaticParams(): Array<{ slug: Array<string> }> {
  return [{ slug: [] }, { slug: ["dashboard"] }, { slug: ["setup"] }];
}

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ slug?: Array<string> }>;
}): Promise<React.JSX.Element> {
  const { slug } = await params;
  const initialPath = slug === undefined || slug.length === 0 ? "/" : `/${slug.join("/")}`;
  return <AppRoot initialPath={initialPath} />;
}
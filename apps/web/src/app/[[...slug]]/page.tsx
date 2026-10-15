import { AppRoot } from "../../shell/app-root";

/**
 * Single catch-all entry. The removed stub screens (`/`, `/dashboard`) are
 * not prerendered; only the functional setup screen is. Unknown paths fall
 * through to the not-found shell at runtime.
 */
export function generateStaticParams(): Array<{ slug: Array<string> }> {
  return [{ slug: ["setup"] }];
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
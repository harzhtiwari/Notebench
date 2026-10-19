import { Banner } from "../primitives/banners.js";

export interface NoModelBannerProps {
  onOpenSettings?: ((page?: string) => void) | undefined;
}

/**
NoModelBanner: warns that no chat model is configured and routes the user to
Settings → Models & Keys. Composed on the unified Banner primitive.
*/
export function NoModelBanner({ onOpenSettings }: NoModelBannerProps) {
  return (
    <Banner
      data-testid="no-model-banner"
      tone="warn"
      title="Attention:"
      message={
        <>
          No model configured. Add an API key in{" "}
          <strong className="font-medium">{"Settings → Models & Keys"}</strong> to chat with
          your sources.
        </>
      }
      actionLabel="Configure model"
      onAction={() => onOpenSettings?.("models")}
      className="mb-6"
    />
  );
}

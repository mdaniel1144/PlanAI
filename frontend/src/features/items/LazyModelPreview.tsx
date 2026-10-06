import { Component, lazy, Suspense, type ComponentProps } from "react";
import type Preview from "./ModelPreview";

const ModelPreview = lazy(async () => {
  try {
    return await import("./ModelPreview");
  } catch (error) {
    if (!import.meta.env.DEV) throw error;
    // Browsers cache failed module requests. In development, retry the source
    // with a fresh URL once (e.g. after a Vite restart or interrupted request).
    // Production keeps Vite's statically resolved, hashed chunk import above.
    return await import("./ModelPreview?preview-retry");
  }
});

class PreviewBoundary extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <div className="item-preview-empty preview-unavailable" role="alert">
          <div>
            <strong>3D preview couldn’t load</strong>
            <p>The item details are still available.</p>
            <p>Save any changes, then reload the page to try again.</p>
          </div>
        </div>
      );
    return this.props.children;
  }
}

export default function LazyModelPreview(
  props: ComponentProps<typeof Preview>,
) {
  return (
    <PreviewBoundary key={props.item.id}>
      <Suspense
        fallback={
          <div className="item-preview-empty" role="status">
            Loading 3D preview…
          </div>
        }
      >
        <ModelPreview {...props} />
      </Suspense>
    </PreviewBoundary>
  );
}

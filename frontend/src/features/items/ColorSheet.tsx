import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function ColorSheet({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = dialog.current!;
    if (!opener.current) opener.current = document.activeElement as HTMLElement;
    el.showModal();
    return () => {
      el.close();
      requestAnimationFrame(() => {
        if (opener.current?.isConnected) opener.current.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="color-sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <p className="eyebrow">Product finish</p>
          <h2>{title}</h2>
        </div>
        <button
          type="button"
          aria-label="Close color editor"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <p className="inspector-help">
        Changes preview on the model. Save to add them to your product.
      </p>
      {children}
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={onClose}
      >
        Cancel
      </button>
    </dialog>
  );
}

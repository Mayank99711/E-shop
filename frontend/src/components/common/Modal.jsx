import { useEffect, useRef } from "react";

export default function Modal({ open, title, onClose, children, labelledBy = "dialog-title", className = "" }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    function onKeyDown(event) {
      // if (event.key === "Escape") {
      //   onCloseRef.current();
      //   return;
      // }
      if (event.key === "Escape") {
        // console.trace("[MODAL-DEBUG] Closed by Escape");
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="app-modal-backdrop" onMouseDown={(event) => {
  if (event.target === event.currentTarget) {
    // console.trace("[MODAL-DEBUG] Closed by backdrop");
    onClose();
  }
}}>
      <section ref={dialogRef} className={`app-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex="-1">
        <header className="app-modal-header">
          <h2 id={labelledBy}>{title}</h2>
          {/* <button ref={closeRef} type="button" className="btn-close" aria-label="Close dialog" onClick={onClose} /> */}
          <button
            ref={closeRef}
            type="button"
            className="btn-close"
            aria-label="Close dialog"
            onClick={() => {

              onClose();
            }}
          />
        </header>
        <div className="app-modal-body">{children}</div>
      </section>
    </div>
  );
}

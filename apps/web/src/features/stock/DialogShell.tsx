import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * Coquille de modale accessible partagée par les dialogues Stock (M5-07) :
 * overlay, `role="dialog"` + `aria-modal`, fermeture au clic-fond/Échap, focus
 * initial sur le premier champ. Miroir du pattern `ForceStepDialog` (Jour J).
 */
export function DialogShell({
  title,
  description,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  /** Empêche la fermeture pendant une requête en cours. */
  busy?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus le premier champ interactif à l'ouverture (saisie immédiate).
    panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-md flex-col gap-5 rounded-lg border border-border bg-background p-6 text-left shadow-xl"
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-xl font-semibold">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

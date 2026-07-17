/**
 * Bandeau de **mentions légales** de la vue d'affichage (M7-13), affiché en
 * **permanence** en bas d'écran (message alcool/allergènes porté par l'écran). Si
 * l'écran ne porte pas de mentions, un rappel par défaut « à consommer avec modération »
 * reste affiché : la mention n'est jamais absente en salle.
 */

/** Rappel par défaut quand l'écran ne porte pas de mentions propres. */
export const DEFAULT_LEGAL_MENTIONS =
  "L'abus d'alcool est dangereux pour la santé, à consommer avec modération.";

export function LegalMentionsBar({ mentions }: { mentions: string | null }) {
  const text = mentions?.trim() ? mentions.trim() : DEFAULT_LEGAL_MENTIONS;
  return (
    <footer
      className="shrink-0 border-t border-border bg-card px-6 py-3 text-center text-base font-medium text-muted-foreground sm:text-lg"
      aria-label="Mentions légales"
    >
      {text}
    </footer>
  );
}

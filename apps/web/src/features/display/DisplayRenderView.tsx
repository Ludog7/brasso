/**
 * Vue d'affichage **plein écran** temps réel (M7-13) — critère de démo M7 « écran bar à
 * jour ». Rend un écran configuré ({{M7-12}}) via l'endpoint de rendu ({{M7-08}}) : seuls
 * les produits **disponibles** (stock > 0, filtrés côté API) apparaissent, avec leurs
 * indicateurs et prix, sous les **mentions légales permanentes**. La resynchronisation
 * (périodique + invalidation) est portée par `useDisplayRender` ; un produit tombé à 0
 * disparaît automatiquement, un produit réapprovisionné réapparaît.
 *
 * Robustesse salle : sur erreur réseau on **conserve le dernier rendu** (pas d'écran
 * blanc) et on signale discrètement « hors ligne / resynchronisation ». Layout atelier :
 * gros texte, fort contraste, mode sombre (thème par défaut de l'app).
 */

import { Loader2, WifiOff } from "lucide-react";

import type { DisplayRenderItem, DisplayTemplate } from "@/lib/api";
import { Button } from "@/ui/button";

import { LegalMentionsBar } from "./LegalMentionsBar";
import { CardsTemplate } from "./templates/CardsTemplate";
import { ListTemplate } from "./templates/ListTemplate";
import { TableTemplate } from "./templates/TableTemplate";
import { useDisplayRender } from "./useDisplayRender";

function TemplateBody({
  template,
  items,
}: {
  template: DisplayTemplate;
  items: DisplayRenderItem[];
}) {
  switch (template) {
    case "LIST":
      return <ListTemplate items={items} />;
    case "TABLE":
      return <TableTemplate items={items} />;
    case "CARDS":
      return <CardsTemplate items={items} />;
  }
}

/** Coquille plein écran centrée (chargement / erreur initiale — avant tout rendu). */
function FullscreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-muted-foreground">
      {children}
    </div>
  );
}

export function DisplayRenderView({
  screenId,
  intervalMs,
}: {
  screenId: string;
  /** Intervalle de resynchronisation (ms) — injectable pour les tests. */
  intervalMs?: number;
}) {
  const { render, isInitialLoading, isInitialError, isStale, refetch } = useDisplayRender(
    screenId,
    intervalMs,
  );

  if (isInitialLoading) {
    return (
      <FullscreenMessage>
        <Loader2 className="size-10 animate-spin" aria-hidden="true" />
        <p className="text-xl">Chargement de l'écran…</p>
      </FullscreenMessage>
    );
  }

  if (isInitialError || !render) {
    return (
      <FullscreenMessage>
        <p role="alert" className="text-2xl font-semibold text-foreground">
          Écran indisponible
        </p>
        <p>Impossible de charger l'affichage pour le moment.</p>
        <Button variant="outline" onClick={refetch}>
          Réessayer
        </Button>
      </FullscreenMessage>
    );
  }

  const { screen, items } = render;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-2xl font-bold sm:text-3xl">{screen.name}</h1>
          <span className="text-lg text-muted-foreground">{screen.surface.name}</span>
        </div>
        {isStale ? (
          <span
            role="status"
            className="inline-flex items-center gap-2 text-base font-medium text-amber-300"
          >
            <WifiOff className="size-5" aria-hidden="true" />
            Hors ligne — resynchronisation…
          </span>
        ) : null}
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-2xl text-muted-foreground">
            Aucun produit disponible pour le moment.
          </div>
        ) : (
          <TemplateBody template={screen.template} items={items} />
        )}
      </main>

      <LegalMentionsBar mentions={screen.legalMentions} />
    </div>
  );
}

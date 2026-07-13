/**
 * Coquille Jour J tablette (M4-08) — écran plein cadre atelier (ADR-05) : thème
 * sombre, cibles tactiles ≥ 48 px (design system), **zéro drag-and-drop**. Charge
 * plan + état via `GET /day` (M4-04) ; propose « Démarrer » si aucune session.
 *
 * Le **dérouleur interactif** (`StepRunner`) pilote l'étape courante en mode normal
 * (Start/Valider câblés sur `POST /day/events`, M4-09) avec **timers de palier après
 * stabilisation** (M4-10). Mesures et forçage arrivent aux tickets suivants.
 */

import { ArrowLeft, Loader2, Play, Wifi, WifiOff } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useBatch } from "@/features/batches/hooks";
import { useDaySession, useOnlineStatus, useStartDay } from "@/features/day/hooks";
import { DAY_PHASE_LABELS } from "@/features/day/labels";
import { StepRunner } from "@/features/day/StepRunner";
import { DayToaster } from "@/features/day/toast";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

/** Nom de la recette figée dans le snapshot (lecture seule). */
function recipeNameFromSnapshot(snapshot: unknown): string | null {
  if (snapshot && typeof snapshot === "object") {
    const name = (snapshot as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

/** Indicateur en ligne / hors-ligne (ADR-08) — arme la file offline en M4-14. */
function ConnectionIndicator() {
  const online = useOnlineStatus();
  return (
    <Badge
      tone={online ? "success" : "muted"}
      role="status"
      className="gap-1.5"
      aria-label={online ? "Connexion : en ligne" : "Connexion : hors ligne"}
    >
      {online ? (
        <Wifi className="size-3.5" aria-hidden="true" />
      ) : (
        <WifiOff className="size-3.5" aria-hidden="true" />
      )}
      {online ? "En ligne" : "Hors ligne"}
    </Badge>
  );
}

export function DayScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const batch = useBatch(id);
  const session = useDaySession(id);
  const startDay = useStartDay(id);

  if (batch.isPending || session.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <span>Chargement du Jour J…</span>
      </div>
    );
  }

  if (batch.isError || !batch.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p role="alert" className="text-destructive-foreground">
          Batch introuvable ou injoignable.
        </p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Retour à l'accueil
        </Button>
      </div>
    );
  }

  const recipeName = recipeNameFromSnapshot(batch.data.recipeSnapshot);
  const day = session.data;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Button asChild variant="ghost" size="icon">
          <Link to={`/batches/${id}`} aria-label="Retour au batch">
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold">Jour J — Batch nº {batch.data.batchNumber}</h1>
          {recipeName ? <span className="truncate text-muted-foreground">{recipeName}</span> : null}
          {day ? <Badge tone="accent">{DAY_PHASE_LABELS[day.phase]}</Badge> : null}
        </div>
        <ConnectionIndicator />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        {day ? (
          <StepRunner day={day} batchId={id} snapshot={batch.data.recipeSnapshot} />
        ) : (
          <StartPanel
            onStart={() => startDay.mutate()}
            pending={startDay.isPending}
            failed={startDay.isError}
          />
        )}
      </main>

      <DayToaster />
    </div>
  );
}

/** Aucune session : invite à démarrer le Jour J (bouton tactile plein). */
function StartPanel({
  onStart,
  pending,
  failed,
}: {
  onStart: () => void;
  pending: boolean;
  failed: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <p className="max-w-sm text-muted-foreground">
        Aucune session Jour J en cours pour ce brassin. Démarre le déroulé pour piloter le brassage
        étape par étape.
      </p>
      <Button size="lg" className="px-10" onClick={onStart} disabled={pending}>
        {pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="size-5" aria-hidden="true" />
        )}
        Démarrer le Jour J
      </Button>
      {failed ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          Impossible de démarrer la session. Vérifie la connexion et réessaie.
        </p>
      ) : null}
    </div>
  );
}

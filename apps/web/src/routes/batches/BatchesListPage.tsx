/**
 * Vue « Brassins » (M9-10) — point d'entrée vers les brassins planifiés depuis
 * les recettes, et suivi des échéances en cours.
 *
 * Un **seul** appel alimente l'écran (`GET /batches/overview`, M9-09) : étape
 * courante et prochaine échéance viennent déjà agrégées, la liste n'interroge
 * jamais une route par ligne.
 *
 * Cible = tablette d'atelier, doigts mouillés (§6) : cibles tactiles ≥ 48 px,
 * pas de drag-and-drop, et en largeur réduite la liste passe en **cartes**
 * plutôt qu'en tableau scrollé horizontalement.
 */

import { AlertTriangle, ArrowRight, Loader2, LogOut, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useBatchesOverview } from "@/features/batches/hooks";
import {
  DEADLINE_LABELS,
  DEADLINE_TONE,
  deadlineUrgency,
  MILESTONE_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
} from "@/features/batches/labels";
import { DAY_PHASE_LABELS } from "@/features/day/labels";
import { useLogout } from "@/hooks/useAuth";
import type { BatchOverview, BatchStatus } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

const STATUSES: BatchStatus[] = [
  "PLANIFIE",
  "EN_BRASSAGE",
  "EN_FERMENTATION",
  "EN_CONDITIONNEMENT",
  "TERMINE",
  "ANNULE",
];

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/** Formate une date calendaire `YYYY-MM-DD` sans repasser par un fuseau. */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return isoDate;
  return dateFmt.format(new Date(year, month - 1, day));
}

/** Intitulé de l'étape courante : phase Jour J ou jalon du cycle. */
function currentStepLabel(step: BatchOverview["currentStep"]): string {
  if (step === null) return "—";
  if (step.source === "DAY") {
    return DAY_PHASE_LABELS[step.code as keyof typeof DAY_PHASE_LABELS] ?? step.code;
  }
  return MILESTONE_LABELS[step.code as keyof typeof MILESTONE_LABELS] ?? step.code;
}

/**
 * Échéance d'un brassin : date, intitulé du jalon et **mention d'urgence**. La
 * mention est textuelle autant que colorée — la couleur seule ne suffit pas
 * (AA, §6).
 */
function DeadlineCell({ deadline }: { deadline: BatchOverview["nextDeadline"] }) {
  if (deadline === null) {
    return <span className="text-muted-foreground">Aucune échéance</span>;
  }
  const urgency = deadlineUrgency(deadline.date);
  const label = MILESTONE_LABELS[deadline.code as keyof typeof MILESTONE_LABELS] ?? deadline.code;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{formatDate(deadline.date)}</span>
      <span className="text-muted-foreground">{label}</span>
      <Badge tone={DEADLINE_TONE[urgency]}>
        {urgency === "overdue" ? (
          <AlertTriangle className="mr-1 size-3.5" aria-hidden="true" />
        ) : null}
        {DEADLINE_LABELS[urgency]}
      </Badge>
    </div>
  );
}

/** Une ligne de la liste — carte en étroit, ligne de tableau en large. */
function BatchRow({ batch }: { batch: BatchOverview }) {
  return (
    <li>
      <Link
        to={`/batches/${batch.id}`}
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Card className="hover:border-primary/60">
          {/* min-h-12 = 48 px : cible tactile confortable sur tablette (§6). */}
          <CardContent className="flex min-h-12 flex-col gap-3 py-4 lg:flex-row lg:items-center lg:gap-6">
            <div className="lg:w-64">
              <p className="font-semibold">
                <span className="text-muted-foreground">N°{batch.batchNumber}</span>{" "}
                {batch.recipeName}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {batch.brewedAt
                  ? `Brassé le ${dateFmt.format(new Date(batch.brewedAt))}`
                  : batch.plannedAt
                    ? `Planifié le ${dateFmt.format(new Date(batch.plannedAt))}`
                    : "Non planifié"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:w-52">
              <Badge tone={STATUS_TONE[batch.status]}>{STATUS_LABELS[batch.status]}</Badge>
              <span className="text-sm text-muted-foreground">
                {currentStepLabel(batch.currentStep)}
              </span>
            </div>

            <div className="flex-1 text-sm">
              <DeadlineCell deadline={batch.nextDeadline} />
              {batch.plannedEndDate !== null ? (
                <p className="mt-1 text-muted-foreground">
                  Fin prévue le {formatDate(batch.plannedEndDate)}
                </p>
              ) : null}
            </div>

            <ArrowRight
              className="hidden size-5 shrink-0 text-muted-foreground lg:block"
              aria-hidden="true"
            />
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}

export function BatchesListPage() {
  const logout = useLogout();
  const [status, setStatus] = useState<BatchStatus | "">("");
  const [scope, setScope] = useState<"all" | "ongoing" | "finished">("ongoing");

  const filters = useMemo(
    () => ({ ...(status ? { status: [status] } : {}), scope }),
    [status, scope],
  );
  const batches = useBatchesOverview(filters);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link to="/" className="text-lg font-semibold">
          Brasso
        </Link>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-5" aria-hidden="true" />
          )}
          Déconnexion
        </Button>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Brassins</h1>
          <Button asChild size="lg">
            <Link to="/recipes">
              <Plus className="size-5" aria-hidden="true" />
              Planifier depuis une recette
            </Link>
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-scope">Affichage</Label>
            <Select
              id="filter-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
              className="min-w-52"
            >
              <option value="ongoing">En cours</option>
              <option value="finished">Terminés</option>
              <option value="all">Tous</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-status">Statut</Label>
            <Select
              id="filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as BatchStatus | "")}
              className="min-w-52"
            >
              <option value="">Tous les statuts</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-6">
          {batches.isPending ? (
            // Squelette plutôt qu'un spinner nu : la page garde sa forme, on ne
            // regarde pas un écran vide en attendant (§4).
            <ul aria-busy="true" aria-label="Chargement des brassins" className="grid gap-4">
              {[0, 1, 2].map((i) => (
                <li key={i}>
                  <Card>
                    <CardContent className="flex min-h-12 flex-col gap-3 py-4">
                      <div className="h-5 w-56 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-80 animate-pulse rounded bg-muted" />
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          ) : batches.isError ? (
            <div className="flex flex-col items-start gap-3 py-12">
              <p role="alert" className="text-destructive-foreground">
                Impossible de charger les brassins.
              </p>
              <Button variant="outline" onClick={() => void batches.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : batches.data.items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <p className="text-muted-foreground">
                  {scope === "ongoing"
                    ? "Aucun brassin en cours."
                    : "Aucun brassin pour ces critères."}
                </p>
                <Button asChild>
                  <Link to="/recipes">Planifier un brassin depuis une recette</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <ul className="grid gap-4">
                {batches.data.items.map((batch) => (
                  <BatchRow key={batch.id} batch={batch} />
                ))}
              </ul>
              {batches.data.total > batches.data.items.length ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  {batches.data.items.length} brassins affichés sur {batches.data.total}.
                </p>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

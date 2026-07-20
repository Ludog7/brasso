import { ArrowLeft, Loader2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { FermentationCharts } from "@/features/batches/charts/FermentationCharts";
import { CostPanel } from "@/features/batches/CostPanel";
import { CyclePanel } from "@/features/batches/CyclePanel";
import { useBatch } from "@/features/batches/hooks";
import { FERMENTATION_STEP_LABELS, STATUS_LABELS, STATUS_TONE } from "@/features/batches/labels";
import { MeasuresJournal } from "@/features/batches/MeasuresJournal";
import { fermentationPlanFromSnapshot } from "@/features/batches/planning";
import { StatusActions } from "@/features/batches/StatusActions";
import { StockDeductionPanel } from "@/features/batches/StockDeductionPanel";
import { useEquipmentProfile } from "@/features/equipment/hooks";
import type { BatchDetail, StockWarning } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/** Construit une table `catalogItemId → nom` depuis le snapshot figé (best-effort). */
function namesFromSnapshot(snapshot: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!snapshot || typeof snapshot !== "object") return map;
  const ingredients = (snapshot as { ingredients?: unknown }).ingredients;
  if (!Array.isArray(ingredients)) return map;
  for (const ing of ingredients) {
    if (ing && typeof ing === "object") {
      const { catalogItemId, name } = ing as { catalogItemId?: unknown; name?: unknown };
      if (typeof catalogItemId === "string" && typeof name === "string")
        map.set(catalogItemId, name);
    }
  }
  return map;
}

/** Nom de la recette figée dans le snapshot (lecture seule). */
function recipeNameFromSnapshot(snapshot: unknown): string | null {
  if (snapshot && typeof snapshot === "object") {
    const name = (snapshot as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

/** Jalons horodatés à afficher (M3-06) — seuls ceux renseignés apparaissent. */
function keyDates(batch: BatchDetail): { label: string; iso: string }[] {
  const entries: { label: string; iso: string | null }[] = [
    { label: "Planifié le", iso: batch.plannedAt },
    { label: "Brassé le", iso: batch.brewedAt },
    { label: "Mis en fermentation le", iso: batch.fermentedAt },
    { label: "Conditionné le", iso: batch.packagedAt },
    { label: "Terminé le", iso: batch.completedAt },
  ];
  return entries.filter((e): e is { label: string; iso: string } => e.iso != null);
}

export function BatchDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const batch = useBatch(id);
  const equipment = useEquipmentProfile(batch.data?.equipmentProfileId ?? undefined);

  // Bilan de réservation transmis par l'écran de planification (M3-08), non bloquant.
  const planNotice = location.state as {
    stockWarnings?: StockWarning[];
    unreservedIngredients?: string[];
  } | null;

  if (batch.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <span>Chargement du batch…</span>
      </div>
    );
  }

  if (batch.isError || !batch.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p role="alert" className="text-destructive-foreground">
          Batch introuvable ou injoignable.
        </p>
        <Button variant="outline" onClick={() => navigate("/recipes")}>
          Retour aux recettes
        </Button>
      </div>
    );
  }

  const data = batch.data;
  const names = namesFromSnapshot(data.recipeSnapshot);
  const recipeName = recipeNameFromSnapshot(data.recipeSnapshot);
  const fermentation = fermentationPlanFromSnapshot(data.recipeSnapshot);
  const dates = keyDates(data);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Button asChild variant="ghost" size="icon">
          <Link to={`/recipes/${data.recipeId}`} aria-label="Retour à la recette">
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">Batch nº {data.batchNumber}</h1>
          <Badge tone={STATUS_TONE[data.status]}>{STATUS_LABELS[data.status]}</Badge>
        </div>
        {data.status === "PLANIFIE" || data.status === "EN_BRASSAGE" ? (
          <Button asChild className="ml-auto">
            <Link to={`/batches/${data.id}/day`}>Piloter le Jour J</Link>
          </Button>
        ) : null}
        {/* Conditionnement (M9-13) : proposé aux mêmes statuts que le serveur
            accepte (M9-08), pour ne pas ouvrir un écran qui refusera la saisie.

            `TERMINE` y mène aussi, sous un autre libellé (#273) : enregistrer le
            conditionnement fait précisément passer le brassin dans cet état, et
            c'est **après** qu'on relève la pression d'un fût. Sans ce lien,
            l'écran de mise en condition devenait inatteignable au moment même où
            il sert. */}
        {data.status === "EN_FERMENTATION" || data.status === "EN_CONDITIONNEMENT" ? (
          <Button asChild className="ml-auto">
            <Link to={`/batches/${data.id}/packaging`}>Conditionner</Link>
          </Button>
        ) : data.status === "TERMINE" ? (
          <Button asChild variant="outline" className="ml-auto">
            <Link to={`/batches/${data.id}/packaging`}>Mise en condition</Link>
          </Button>
        ) : null}
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        {planNotice?.stockWarnings && planNotice.stockWarnings.length > 0 ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
          >
            <p className="font-medium">
              Stock insuffisant pour certains articles (indicatif, non bloquant) :
            </p>
            <ul className="list-disc pl-5">
              {planNotice.stockWarnings.map((w) => (
                <li key={w.catalogItemId}>
                  {w.name} — besoin {w.requested}, disponible {w.available}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informations</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <Info
              label="Recette (version figée)"
              value={
                recipeName ? `${recipeName} · v${data.recipeVersion}` : `v${data.recipeVersion}`
              }
            />
            <Info label="Équipement" value={equipment.data?.name ?? "—"} />
            <Info label="Créé le" value={dateFmt.format(new Date(data.createdAt))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Statut &amp; dates clés</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <StatusActions batch={data} />
            {dates.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {dates.map((d) => (
                  <li key={d.label} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="font-medium">{dateFmt.format(new Date(d.iso))}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        {/* Cycle post-ensemencement (M9-10) : jalons datés et chaîne des volumes. */}
        <CyclePanel batchId={data.id} />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Plan de fermentation</CardTitle>
          </CardHeader>
          <CardContent>
            {fermentation.length > 0 ? (
              <ol className="flex flex-col gap-2">
                {fermentation.map((step, i) => (
                  <li
                    key={`${step.type}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <span>
                      {FERMENTATION_STEP_LABELS[step.type] ?? step.type}
                      {step.name ? (
                        <span className="text-muted-foreground"> — {step.name}</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{step.tempC != null ? `${step.tempC} °C` : "— °C"}</span>
                      <span>
                        {step.durationDays != null
                          ? `${step.durationDays} j`
                          : step.durationMin != null
                            ? `${step.durationMin} min`
                            : "—"}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune étape de fermentation dans la recette. Plan indicatif, dérivé de la recette
                figée.
              </p>
            )}
          </CardContent>
        </Card>

        <FermentationCharts batchId={data.id} />

        <MeasuresJournal batchId={data.id} />

        <CostPanel batchId={data.id} />

        <StockDeductionPanel reservations={data.reservations} names={names} />
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

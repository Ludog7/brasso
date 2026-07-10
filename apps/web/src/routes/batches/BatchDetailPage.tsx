import { ArrowLeft, Loader2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { useBatch } from "@/features/batches/hooks";
import { useEquipmentProfile } from "@/features/equipment/hooks";
import type { BatchStatus, StockWarning } from "@/lib/api";
import { Badge, type BadgeProps } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

const STATUS_LABELS: Record<BatchStatus, string> = {
  PLANIFIE: "Planifié",
  EN_BRASSAGE: "En brassage",
  EN_FERMENTATION: "En fermentation",
  EN_CONDITIONNEMENT: "En conditionnement",
  TERMINE: "Terminé",
  ANNULE: "Annulé",
};

const STATUS_TONE: Record<BatchStatus, NonNullable<BadgeProps["tone"]>> = {
  PLANIFIE: "accent",
  EN_BRASSAGE: "accent",
  EN_FERMENTATION: "accent",
  EN_CONDITIONNEMENT: "accent",
  TERMINE: "success",
  ANNULE: "muted",
};

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
  const reserved = data.reservations.filter((r) => r.status === "RESERVED");

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
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        {planNotice?.stockWarnings && planNotice.stockWarnings.length > 0 ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
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
            <Info label="Recette (version figée)" value={`v${data.recipeVersion}`} />
            <Info label="Équipement" value={equipment.data?.name ?? "—"} />
            <Info
              label="Date planifiée"
              value={data.plannedAt ? dateFmt.format(new Date(data.plannedAt)) : "—"}
            />
            <Info label="Créé le" value={dateFmt.format(new Date(data.createdAt))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stock réservé</CardTitle>
          </CardHeader>
          <CardContent>
            {reserved.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {reserved.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <span>{names.get(r.catalogItemId) ?? r.catalogItemId}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{r.quantity}</span>
                      <Badge tone="success">Réservé</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune réservation de stock.</p>
            )}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Le suivi du batch (mesures, plan de fermentation, journal) arrive prochainement.
        </p>
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

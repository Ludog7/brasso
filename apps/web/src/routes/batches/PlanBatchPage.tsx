import { ArrowLeft, Loader2, PlayCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { usePlanBatch } from "@/features/batches/hooks";
import { computePlanPreview, plannedReservations } from "@/features/batches/planning";
import { useEquipmentProfiles } from "@/features/equipment/hooks";
import { useRecipe } from "@/features/recipes/hooks";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

const vol = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function PlanBatchPage() {
  const { recipeId = "" } = useParams();
  const navigate = useNavigate();
  const recipe = useRecipe(recipeId);
  const profiles = useEquipmentProfiles({ active: true });
  const plan = usePlanBatch();

  const [equipmentProfileId, setEquipmentProfileId] = useState("");
  const [plannedAt, setPlannedAt] = useState("");

  const selectedProfile = useMemo(
    () => profiles.data?.find((p) => p.id === equipmentProfileId),
    [profiles.data, equipmentProfileId],
  );

  const preview = useMemo(
    () =>
      recipe.data && selectedProfile ? computePlanPreview(recipe.data, selectedProfile) : null,
    [recipe.data, selectedProfile],
  );

  const reservations = useMemo(
    () => (recipe.data ? plannedReservations(recipe.data) : null),
    [recipe.data],
  );

  if (recipe.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <span>Chargement de la recette…</span>
      </div>
    );
  }

  if (recipe.isError || !recipe.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p role="alert" className="text-destructive-foreground">
          Recette introuvable ou injoignable.
        </p>
        <Button variant="outline" onClick={() => navigate("/recipes")}>
          Retour aux recettes
        </Button>
      </div>
    );
  }

  const data = recipe.data;

  const onSubmit = (): void => {
    if (plan.isPending || !equipmentProfileId) return;
    plan.mutate(
      {
        recipeId: data.id,
        equipmentProfileId,
        ...(plannedAt ? { plannedAt: new Date(plannedAt).toISOString() } : {}),
      },
      {
        onSuccess: (result) =>
          navigate(`/batches/${result.batch.id}`, {
            replace: true,
            state: {
              stockWarnings: result.stockWarnings,
              unreservedIngredients: result.unreservedIngredients,
            },
          }),
      },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Button asChild variant="ghost" size="icon">
          <Link to={`/recipes/${data.id}`} aria-label="Retour à la recette">
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
        </Button>
        <span className="text-lg font-semibold">Planifier un batch</span>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        {data.status !== "PUBLISHED" ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 py-8">
              <p role="alert" className="text-destructive-foreground">
                Seule une recette <strong>publiée</strong> peut être planifiée en batch.
              </p>
              <Button asChild variant="outline">
                <Link to={`/recipes/${data.id}`}>Retour à la recette</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {data.name} <span className="text-muted-foreground">v{data.version}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="equipment-profile">Profil d'équipement</Label>
                  {profiles.isPending ? (
                    <span className="text-sm text-muted-foreground">Chargement des profils…</span>
                  ) : profiles.data && profiles.data.length > 0 ? (
                    <Select
                      id="equipment-profile"
                      value={equipmentProfileId}
                      onChange={(e) => setEquipmentProfileId(e.target.value)}
                    >
                      <option value="">Choisir un profil…</option>
                      {profiles.data.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({vol.format(p.nominalVolumeL)} L)
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aucun profil d'équipement actif.{" "}
                      <Link to="/equipment/new" className="underline">
                        Créer un profil
                      </Link>
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="planned-at">Date planifiée (optionnel)</Label>
                  <input
                    id="planned-at"
                    type="date"
                    value={plannedAt}
                    onChange={(e) => setPlannedAt(e.target.value)}
                    className="flex min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-64"
                  />
                </div>
              </CardContent>
            </Card>

            <p className="text-sm text-muted-foreground">
              Les volumes et le stock affichés sont un <strong>aperçu</strong> d'aide à la décision,
              recalculé à la création du batch.
            </p>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Plan d'eau &amp; volumes</CardTitle>
              </CardHeader>
              <CardContent>
                {preview ? (
                  <>
                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <Metric label="Empâtage" value={`${vol.format(preview.mashWaterL)} L`} />
                      <Metric label="Rinçage" value={`${vol.format(preview.spargeWaterL)} L`} />
                      <Metric label="Eau totale" value={`${vol.format(preview.totalWaterL)} L`} />
                      <Metric
                        label="Pré-ébullition"
                        value={`${vol.format(preview.preBoilVolumeL)} L`}
                      />
                    </dl>
                    {preview.warnings.length > 0 ? (
                      <ul className="mt-4 flex flex-col gap-1 text-sm text-warning">
                        {preview.warnings.map((w) => (
                          <li key={w} role="alert">
                            ⚠ {w}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Choisis un profil d'équipement pour afficher l'aperçu des volumes.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Stock réservé</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {reservations && reservations.reservations.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {reservations.reservations.map((r) => (
                      <li
                        key={r.catalogItemId}
                        className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                      >
                        <span>{r.name}</span>
                        <span className="font-medium">
                          {vol.format(r.quantity)}{" "}
                          {r.unit === "GRAM" ? "g" : r.unit === "LITER" ? "L" : "u"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucun ingrédient catalogué à réserver pour cette recette.
                  </p>
                )}
                {reservations && reservations.unreserved.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Ingrédients hors catalogue (saisis à la main, non réservés) :{" "}
                    {reservations.unreserved.join(", ")}.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {plan.isError ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
              >
                Planification impossible. Vérifie ta connexion puis réessaie.
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                size="lg"
                onClick={onSubmit}
                disabled={plan.isPending || !equipmentProfileId}
              >
                {plan.isPending ? (
                  <>
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                    Création…
                  </>
                ) : (
                  <>
                    <PlayCircle className="size-5" aria-hidden="true" />
                    Créer le batch
                  </>
                )}
              </Button>
              {!equipmentProfileId ? (
                <span className="text-sm text-muted-foreground">
                  Choisis un profil d'équipement pour créer le batch.
                </span>
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

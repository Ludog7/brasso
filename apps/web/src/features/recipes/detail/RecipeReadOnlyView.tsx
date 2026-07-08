import type { ReactNode } from "react";

import type { RecipeDetail } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

import {
  INGREDIENT_CATEGORY_LABELS,
  STABILIZATION_LABELS,
  STEP_TYPE_LABELS,
  STORAGE_MODE_LABELS,
  UNIT_LABELS,
} from "../labels";
import { RecipePredictions } from "./RecipePredictions";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

/** Paire libellé/valeur d'une fiche de détail ; les entrées vides sont filtrées. */
interface Field {
  label: string;
  value: ReactNode;
}

function fmtNum(value: number | null | undefined, suffix = ""): string | null {
  return value == null ? null : `${nf.format(value)}${suffix}`;
}

/** Champs de détail persistés selon le moteur (colonnes `RecipeXxxDetails`). */
function detailFields(recipe: RecipeDetail): Field[] {
  const raw: (Field | null)[] = [];
  if (recipe.engine === "BEER") {
    const d = recipe.beerDetails;
    raw.push(
      { label: "Style BJCP", value: d?.styleBjcp ?? null },
      { label: "Volume cible", value: fmtNum(d?.batchVolumeL, " L") },
      { label: "OG cible", value: fmtNum(d?.targetOg) },
      { label: "FG cible", value: fmtNum(d?.targetFg) },
      { label: "IBU cible", value: fmtNum(d?.targetIbu) },
      { label: "EBC cible", value: fmtNum(d?.targetEbc) },
      { label: "Temps d'ébullition", value: fmtNum(d?.boilTimeMin, " min") },
      {
        label: "Rendement",
        value: d?.efficiency == null ? null : `${nf.format(d.efficiency * 100)} %`,
      },
    );
  } else if (recipe.engine === "ALT_FERMENTED") {
    const d = recipe.altDetails;
    raw.push(
      { label: "Type de base", value: d?.baseType ?? null },
      { label: "Volume cible", value: fmtNum(d?.batchVolumeL, " L") },
      { label: "pH cible", value: fmtNum(d?.targetPh) },
      {
        label: "Stabilisation",
        value: d?.stabilizationMethod
          ? STABILIZATION_LABELS[d.stabilizationMethod as keyof typeof STABILIZATION_LABELS]
          : null,
      },
      { label: "Risque de sucre résiduel", value: d?.residualSugarRisk ? "Oui" : "Non" },
    );
  } else if (recipe.engine === "SOFT_DRINK") {
    const d = recipe.softDetails;
    raw.push(
      { label: "Concentration en sucre", value: fmtNum(d?.sugarConcentration, " g/L") },
      { label: "Volume cible", value: fmtNum(d?.batchVolumeL, " L") },
      { label: "pH cible", value: fmtNum(d?.targetPh) },
      {
        label: "Conservation",
        value: d?.storageMode
          ? STORAGE_MODE_LABELS[d.storageMode as keyof typeof STORAGE_MODE_LABELS]
          : null,
      },
      {
        label: "Stabilisation",
        value: d?.stabilizationMethod
          ? STABILIZATION_LABELS[d.stabilizationMethod as keyof typeof STABILIZATION_LABELS]
          : null,
      },
    );
  }
  return raw.filter((f): f is Field => f !== null && f.value != null && f.value !== "");
}

/**
 * Vue **lecture seule** d'une recette (M2-09) : fiche de détail moteur, ingrédients,
 * process et prévisions calculées localement. Aucun champ éditable — la mutation
 * passe par la barre d'actions (publier / nouvelle version / archiver).
 */
export function RecipeReadOnlyView({ recipe }: { recipe: RecipeDetail }) {
  const fields = detailFields(recipe);
  const ingredients = [...recipe.ingredients].sort((a, b) => a.sortOrder - b.sortOrder);
  const steps = [...recipe.steps].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Détails</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {recipe.notes ? (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{recipe.notes}</p>
            ) : null}
            {fields.length > 0 ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.label} className="flex flex-col">
                    <dt className="text-sm text-muted-foreground">{f.label}</dt>
                    <dd className="font-medium text-foreground">{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun détail renseigné.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ingrédients</CardTitle>
          </CardHeader>
          <CardContent>
            {ingredients.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun ingrédient.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {ingredients.map((ing) => (
                  <li key={ing.id} className="flex items-baseline justify-between gap-4 py-2">
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">{ing.name}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {INGREDIENT_CATEGORY_LABELS[ing.category]}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                      {nf.format(ing.amount)} {UNIT_LABELS[ing.unit]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Process</CardTitle>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune étape.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {steps.map((step, i) => (
                  <li key={step.id} className="flex items-baseline gap-3 py-2">
                    <span className="font-mono text-sm text-muted-foreground">{i + 1}.</span>
                    <span className="font-medium text-foreground">
                      {STEP_TYPE_LABELS[step.type]}
                    </span>
                    {step.name ? (
                      <span className="text-sm text-muted-foreground">— {step.name}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <aside>
        <RecipePredictions recipe={recipe} />
      </aside>
    </div>
  );
}

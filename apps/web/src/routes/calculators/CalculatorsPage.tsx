/**
 * Page « Calculateurs » d'atelier (M8-02) : quatre outils autonomes (starter, eau,
 * dilution, BIAB) branchés sur les fonctions pures de `@brasso/core` ({{M8-01}}).
 * Calcul **100 % client** (ADR-03) : aucune requête réseau, aucune persistance, aucun
 * lien à une recette ou à un batch. Accessible à tout utilisateur authentifié.
 */

import { BiabCalculator } from "@/features/calculators/BiabCalculator";
import { DilutionCalculator } from "@/features/calculators/DilutionCalculator";
import { StarterCalculator } from "@/features/calculators/StarterCalculator";
import { WaterCalculator } from "@/features/calculators/WaterCalculator";
import { AppShell } from "@/routes/AppShell";

export function CalculatorsPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Calculateurs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Outils de brassage indépendants : saisissez vos valeurs, le résultat se recalcule
        instantanément. Rien n'est enregistré.
      </p>
      <div className="mt-6 flex flex-col gap-6">
        <StarterCalculator />
        <WaterCalculator />
        <DilutionCalculator />
        <BiabCalculator />
      </div>
    </AppShell>
  );
}

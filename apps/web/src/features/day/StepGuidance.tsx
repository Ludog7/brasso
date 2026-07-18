/**
 * Consigne contextuelle de l'étape courante (M9-11, §D). Aujourd'hui une seule
 * étape en porte une : l'**assainissement du circuit de refroidissement**,
 * dérivée par `buildDayPlan` (M9-03) et donc absente des recettes — sans
 * explication à l'écran, l'opérateur voit surgir une étape qu'il n'a jamais
 * écrite.
 *
 * > **ADR-11.** Ce que l'étape produit est un **indicateur d'aide à la
 * > décision**, pas une attestation d'innocuité. Le vocabulaire dit
 * > « assainissement » ; « stérilisation », « stérile » et les formulations
 * > rassurantes sont proscrites, et le disclaimer permanent de `core`
 * > accompagne l'étape.
 */

import { FOOD_SAFETY_DISCLAIMER, type StepSpec } from "@brasso/core";
import { Info } from "lucide-react";

/**
 * Identifiant de l'étape d'assainissement dérivée par `core`
 * (`stateMachine/buildPlan.ts`). Recopié plutôt qu'importé : `core` n'expose pas
 * ses ids d'étapes, et le plan est de toute façon relu depuis du JSONB persisté.
 */
export const SANITIZE_STEP_ID = "boil-sanitize-1";

export function StepGuidance({ step }: { step: StepSpec }) {
  if (step.id !== SANITIZE_STEP_ID) return null;

  return (
    <section
      aria-label="Consigne de l'étape"
      data-testid="sanitize-guidance"
      className="flex w-full max-w-xs flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left"
    >
      <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        <Info className="size-4 shrink-0" aria-hidden="true" />
        Assainissement du circuit
      </h3>
      <p className="text-sm">
        Fais circuler le moût encore bouillant dans le circuit de refroidissement pendant toute la
        durée de l'étape, retour à la cuve. Le feu reste allumé jusqu'au hors-flamme.
      </p>
      <p className="text-sm text-muted-foreground">
        Assainissement du circuit — indicateur d'aide à la décision.
      </p>
      <p data-testid="sanitize-disclaimer" className="text-xs text-muted-foreground">
        {FOOD_SAFETY_DISCLAIMER}
      </p>
    </section>
  );
}

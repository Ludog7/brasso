/**
 * Mise en condition d'un produit conditionné **avant mise en vente** (M9-15).
 *
 * Une bière tout juste conditionnée est plate : il lui manque ses bulles. Deux
 * voies, selon le contenant :
 * - **bouteille** — refermentation : la levure résiduelle consomme le sucre de
 *   priming et carbonate en bouteille (FORMULES §8.1). Il faut compter quelques
 *   semaines ;
 * - **fût** — carbonatation forcée : le CO₂ est poussé au détendeur, sans
 *   refermentation (§8.2). La pression à régler dépend du CO₂ visé **et** de la
 *   température ; une fois le réglage constaté, il faut compter quelques jours.
 *
 * Aucune formule nouvelle : la pression vient de `kegPressurePsi` (§8.2, loi de
 * Henry) et la conversion de `units.ts`. Aucun délai codé en dur non plus — ce
 * sont des paramètres `Settings` fournis en entrée (ADR-01).
 *
 * ADR-11 : la date produite est un **indicateur d'aide à la décision**, jamais
 * une garantie — on dit « prêt à la vente estimé le … », jamais « conforme ».
 */

import { kegPressurePsi } from "../formulas/carbonation.js";
import { psiToBar } from "../units.js";
import { addCalendarDays, calendarDateInZone } from "./calendar.js";

/** Mise en condition d'une ligne de conditionnement (miroir Prisma). */
export type ConditioningMethod = "NONE" | "REFERMENTATION" | "FORCED_CARBONATION";

/**
 * Pression à régler au détendeur (**bar**) pour atteindre un CO₂ visé à une
 * température donnée — FORMULES §8.2, exprimée dans l'unité interne.
 *
 * La formule rend des PSI (standard kegging) ; la conversion passe
 * **exclusivement** par `units.ts` (CLAUDE.md). Une pression négative n'a pas de
 * sens physique : elle est ramenée à 0, ce qui traduit « aucune pression à
 * appliquer » pour une bière déjà plus carbonatée que la cible.
 */
export function targetCarbonationPressureBar(
  co2TargetVolumes: number,
  tempC: number,
  altitudeFt = 0,
): number {
  return Math.max(0, psiToBar(kegPressurePsi(co2TargetVolumes, tempC, altitudeFt)));
}

/** Verdict d'un relevé de pression au fût. */
export interface CarbonationCheck {
  /** Pression cible (bar) **recalculée à la température relevée**. */
  readonly targetBar: number;
  /** Écart signé (bar) entre le relevé et la cible : négatif = sous-carbonaté. */
  readonly deltaBar: number;
  /** Le relevé tombe-t-il dans la tolérance ? */
  readonly onTarget: boolean;
}

/**
 * Juge un relevé de carbonatation forcée.
 *
 * La cible est **recalculée à la température relevée**, et non à celle prévue :
 * une bière plus chaude demande davantage de pression pour le même CO₂
 * dissous. Comparer à la cible d'une autre température validerait une bière
 * insuffisamment carbonatée — c'est-à-dire plate.
 *
 * @param toleranceBar écart admis de part et d'autre (paramètre `Settings`).
 */
export function checkCarbonation(
  co2TargetVolumes: number,
  measuredPressureBar: number,
  measuredTempC: number,
  toleranceBar: number,
  altitudeFt = 0,
): CarbonationCheck {
  const targetBar = targetCarbonationPressureBar(co2TargetVolumes, measuredTempC, altitudeFt);
  const deltaBar = measuredPressureBar - targetBar;
  // Marge d'arithmétique flottante : un relevé exactement à la borne doit
  // passer. Sans elle, `cible + 0,2` vaut `cible + 0,20000000000000007` et
  // serait rejeté — l'opérateur verrait sa mesure refusée sans comprendre.
  return { targetBar, deltaBar, onTarget: Math.abs(deltaBar) <= Math.abs(toleranceBar) + 1e-9 };
}

/** Délais de mise en condition (jours), lus des `Settings` (ADR-01). */
export interface ConditioningDelays {
  /** Refermentation en bouteille — défaut métier ~21 j. */
  readonly refermentationDays: number;
  /** Carbonatation forcée en fût, après relevé conforme — défaut métier ~7 j. */
  readonly forcedCarbonationDays: number;
}

/** Entrée de {@link saleAvailability}. */
export interface SaleAvailabilityInput {
  readonly method: ConditioningMethod;
  /** Instant du conditionnement — origine du délai de refermentation. */
  readonly packagedAt: number;
  /**
   * Instant du relevé de pression **jugé conforme** — origine du délai de
   * carbonatation forcée. Absent tant qu'aucun relevé ne l'est.
   */
  readonly carbonationValidatedAt?: number | null;
  readonly delays: ConditioningDelays;
  /** Fuseau IANA de l'instance : le délai se compte en jours **calendaires**. */
  readonly timezone: string;
}

/** Disponibilité à la vente estimée d'une ligne de conditionnement. */
export interface SaleAvailability {
  /** Instant estimé de mise en vente, ou `null` si la condition n'est pas engagée. */
  readonly availableAt: number | null;
  /** Date calendaire correspondante (`YYYY-MM-DD`), ou `null`. */
  readonly availableDate: string | null;
  /**
   * Pourquoi aucune date n'est encore estimable, à afficher tel quel. `null`
   * quand une date existe.
   */
  readonly pendingReason: string | null;
}

const NOT_AVAILABLE = (pendingReason: string): SaleAvailability => ({
  availableAt: null,
  availableDate: null,
  pendingReason,
});

/**
 * Date estimée de mise en vente d'une ligne de conditionnement.
 *
 * - **Refermentation** : le délai court depuis le conditionnement — la levure
 *   travaille dès la mise en bouteille.
 * - **Carbonatation forcée** : il court depuis le **relevé conforme**, pas
 *   depuis le conditionnement. Tant que la pression n'est pas constatée, rien ne
 *   garantit que le fût soit sous CO₂ : dater depuis la mise en fût promettrait
 *   une bière prête alors qu'elle peut être restée plate.
 * - **Aucune méthode** : pas de date. On ne déclare pas vendable ce dont la
 *   carbonatation n'a jamais été engagée.
 *
 * Les délais sont comptés en jours **calendaires** dans le fuseau de l'instance
 * (jamais en millisecondes, cf. FORMULES §13.1). Un délai nul ou négatif rend la
 * ligne disponible immédiatement à son point de départ.
 */
export function saleAvailability(input: SaleAvailabilityInput): SaleAvailability {
  const { method, delays, timezone } = input;

  if (method === "NONE") {
    return NOT_AVAILABLE("Aucune mise en condition déclarée pour ce contenant.");
  }

  const from =
    method === "REFERMENTATION" ? input.packagedAt : (input.carbonationValidatedAt ?? null);
  if (from === null || !Number.isFinite(from)) {
    // ADR-11 : on décrit ce qui manque, sans jamais attester d'une conformité.
    return NOT_AVAILABLE(
      "Carbonatation forcée : en attente d'un relevé de pression atteignant la cible.",
    );
  }

  const days =
    method === "REFERMENTATION" ? delays.refermentationDays : delays.forcedCarbonationDays;
  const availableAt = addCalendarDays(from, Math.max(0, Math.trunc(days)), timezone);
  return {
    availableAt,
    availableDate: calendarDateInZone(availableAt, timezone),
    pendingReason: null,
  };
}

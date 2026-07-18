/**
 * Pont **recette → plan Jour J** (M4-01) — dérive un {@link DayPlan} réel depuis
 * le `recipeSnapshot` figé d'un batch (M3) et, optionnellement, le profil
 * d'équipement. Expose aussi le mapping des phases core ↔ enum Prisma `DayPhase`.
 *
 * Pur & déterministe (ADR-03) : aucune lecture d'horloge, aucune dépendance DB/UI.
 * Le snapshot est du JSON opaque (JSONB) : la lecture est **défensive** — un champ
 * absent ou mal typé est ignoré, jamais une exception.
 *
 * SOURCE MÉTIER : `docs/SPEC-FONCTIONNELLE.md` (« State Machine Jour J », phases
 * Initialisation → … → Ensemencement) ; ADR-08.
 */

import { defaultDayPlan } from "./plan.js";
import type { DayPlan, MeasurementKind, Phase, StepSpec } from "./types.js";

/**
 * Enum des phases Jour J côté persistance (français) — miroir **exact** de l'enum
 * Prisma `DayPhase` (M1-01, `schema.prisma`). Valeurs recopiées, pas d'import DB
 * (ADR-03). `TERMINE` correspond au brassin achevé (pas une {@link Phase} core).
 *
 * `WHIRLPOOL` est ajouté par la migration M9-02 : la valeur est **persistable**
 * dès maintenant, mais aucune {@link Phase} core ne la produit encore — c'est
 * {@link mapStep} (M9-03) qui réintégrera l'étape au plan et complètera
 * {@link phaseToDayPhase}. L'ordre de déclaration suit la séquence réelle du
 * brassage (ébullition → whirlpool → refroidissement) et l'ordre physique de
 * l'enum PostgreSQL.
 */
export type DayPhase =
  | "INITIALISATION"
  | "EMPATAGE"
  | "FILTRATION"
  | "EBULLITION"
  | "WHIRLPOOL"
  | "REFROIDISSEMENT"
  | "ENSEMENCEMENT"
  | "TERMINE";

/** Correspondance phase core → phase Prisma. `null` (aucune étape courante) → `TERMINE`. */
export function phaseToDayPhase(phase: Phase | null): DayPhase {
  switch (phase) {
    case "INITIALIZATION":
      return "INITIALISATION";
    case "MASH":
      return "EMPATAGE";
    case "LAUTER":
      return "FILTRATION";
    case "BOIL":
      return "EBULLITION";
    case "COOLING":
      return "REFROIDISSEMENT";
    case "PITCHING":
      return "ENSEMENCEMENT";
    case null:
      return "TERMINE";
  }
}

/**
 * Sous-ensemble du profil d'équipement utile à l'estimation des rampes de chauffe
 * (M3-03). Un profil complet est assignable ; seuls ces deux champs sont lus.
 */
export interface PlanEquipment {
  /** Puissance de chauffe (kW). */
  readonly heatingPowerKw?: number | null;
  /** Masse thermique de la cuve (kJ/°C). */
  readonly thermalMassKjPerC?: number | null;
}

/** Entrée de {@link buildDayPlan}. */
export interface BuildDayPlanInput {
  /** Copie figée de la recette publiée (JSONB immuable, ADR-06/07) — JSON opaque. */
  readonly recipeSnapshot: unknown;
  /** Profil d'équipement du batch (rampes indicatives) — optionnel. */
  readonly equipment?: PlanEquipment;
}

/** Rampe de chauffe indicative par défaut (min) de l'empâtage, faute de profil. */
const MASH_DEFAULT_RAMP_MIN = 15;
/** Rampe de chauffe indicative par défaut (min) de l'ébullition, faute de profil. */
const BOIL_DEFAULT_RAMP_MIN = 20;
/** Température de départ indicative de l'empâtage (eau/local) — pour la rampe. */
const MASH_START_C = 20;
/** Température de départ indicative de l'ébullition (fin de rinçage) — pour la rampe. */
const BOIL_START_C = 76;
/** Température d'ébullition canonique (°C) — cible de stabilisation du `BOIL`. */
const BOIL_TARGET_C = 100;

/** Lecture défensive d'un nombre fini ; `undefined` sinon. */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Estime la rampe de chauffe (min) d'une phase qui chauffe. Utilise le profil si
 * `heatingPowerKw` **et** `thermalMassKjPerC` sont fournis et qu'une cible est
 * connue : `t = masse_thermique × ΔT / puissance` ; sinon la valeur par défaut de
 * la phase. Indicative (ADR-11) — jamais présentée comme une garantie.
 */
function estimateRampMin(
  targetTempC: number | undefined,
  startC: number,
  fallbackMin: number,
  equipment: PlanEquipment | undefined,
): number {
  const powerKw = finiteNumber(equipment?.heatingPowerKw);
  const massKjPerC = finiteNumber(equipment?.thermalMassKjPerC);
  if (
    powerKw === undefined ||
    powerKw <= 0 ||
    massKjPerC === undefined ||
    targetTempC === undefined
  ) {
    return fallbackMin;
  }
  const deltaC = Math.max(0, targetTempC - startC);
  // Énergie (kJ) = masse thermique × ΔT ; temps (min) = énergie / puissance / 60.
  return Math.round((massKjPerC * deltaC) / (powerKw * 60));
}

/** Étape de process telle que lue dans le snapshot (défensivement). */
interface RawStep {
  readonly type: string;
  readonly name?: string;
  readonly params: Record<string, unknown>;
  readonly sortOrder: number;
}

/** Extrait les étapes de process du snapshot, ordonnées par `sortOrder`. */
function extractSteps(snapshot: unknown): readonly RawStep[] {
  if (typeof snapshot !== "object" || snapshot === null) return [];
  const steps = (snapshot as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];

  const raw: RawStep[] = [];
  for (const [index, entry] of steps.entries()) {
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.type !== "string") continue;
    raw.push({
      type: rec.type,
      name: typeof rec.name === "string" && rec.name.length > 0 ? rec.name : undefined,
      params:
        typeof rec.params === "object" && rec.params !== null
          ? (rec.params as Record<string, unknown>)
          : {},
      sortOrder: finiteNumber(rec.sortOrder) ?? index,
    });
  }
  return raw.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Compteurs d'ids stables par phase (`mash-1`, `mash-2`, `boil-1`, …). */
type PhaseCounters = Partial<Record<Phase, number>>;

const REQUIRED_TEMP: readonly MeasurementKind[] = ["temperature"];
const REQUIRED_LAUTER: readonly MeasurementKind[] = ["density", "volume"];

/**
 * Mappe une étape de recette vers une {@link StepSpec} Jour J, ou `null` si le
 * type n'a pas de correspondance sur le brassin (WHIRLPOOL/CONDITION/PACKAGE/…).
 * Renseigne les compteurs d'ids stables.
 */
function mapStep(
  raw: RawStep,
  counters: PhaseCounters,
  equipment: PlanEquipment | undefined,
): StepSpec | null {
  const next = (phase: Phase): number => {
    const n = (counters[phase] ?? 0) + 1;
    counters[phase] = n;
    return n;
  };

  switch (raw.type) {
    case "MASH":
    case "MASH_STEP": {
      const n = next("MASH");
      const targetTempC = finiteNumber(raw.params.tempC);
      return {
        id: `mash-${n}`,
        phase: "MASH",
        label: raw.name ?? `Empâtage — palier ${n}`,
        requiresStabilization: true,
        plannedHoldMin: finiteNumber(raw.params.timeMin),
        plannedRampMin: estimateRampMin(
          targetTempC,
          MASH_START_C,
          MASH_DEFAULT_RAMP_MIN,
          equipment,
        ),
        targetTempC,
        requiredMeasurements: REQUIRED_TEMP,
      };
    }

    case "SPARGE": {
      const n = next("LAUTER");
      return {
        id: `lauter-${n}`,
        phase: "LAUTER",
        label: raw.name ?? "Filtration / Pré-ébullition",
        requiresStabilization: false,
        targetTempC: finiteNumber(raw.params.tempC),
        requiredMeasurements: REQUIRED_LAUTER,
      };
    }

    case "BOIL": {
      const n = next("BOIL");
      return {
        id: `boil-${n}`,
        phase: "BOIL",
        label: raw.name ?? "Ébullition",
        requiresStabilization: true,
        plannedHoldMin: finiteNumber(raw.params.timeMin),
        plannedRampMin: estimateRampMin(
          BOIL_TARGET_C,
          BOIL_START_C,
          BOIL_DEFAULT_RAMP_MIN,
          equipment,
        ),
        targetTempC: BOIL_TARGET_C,
      };
    }

    case "COOL": {
      const n = next("COOLING");
      return {
        id: `cooling-${n}`,
        phase: "COOLING",
        label: raw.name ?? "Refroidissement",
        requiresStabilization: true,
        targetTempC: finiteNumber(raw.params.targetTempC),
        requiredMeasurements: REQUIRED_TEMP,
      };
    }

    case "FERMENT": {
      // L'ensemencement clôt le Jour J : un **seul** jalon PITCHING, même si la
      // recette décrit plusieurs étapes de fermentation.
      if ((counters.PITCHING ?? 0) > 0) return null;
      next("PITCHING");
      return {
        id: "pitching-1",
        phase: "PITCHING",
        label: raw.name ?? "Ensemencement",
        requiresStabilization: false,
      };
    }

    default:
      // WHIRLPOOL, STABILIZE, CONDITION, PACKAGE, OTHER : hors périmètre Jour J.
      return null;
  }
}

/**
 * Construit le {@link DayPlan} d'un batch depuis son `recipeSnapshot` (+ profil).
 *
 * Le plan démarre toujours par un jalon `INITIALISATION`, puis reprend, **dans
 * l'ordre de la recette**, les étapes exploitables : empâtage(s) → filtration →
 * ébullition → refroidissement → ensemencement. Un empâtage multi-paliers produit
 * autant d'étapes `MASH` (`mash-1`, `mash-2`, …). Le plan est directement
 * consommable par `transition`/`initDayState` (M1-13).
 *
 * @returns le plan dérivé, ou {@link defaultDayPlan} si le snapshot n'expose
 *   aucune étape exploitable (recette vide, snapshot corrompu…).
 */
export function buildDayPlan({ recipeSnapshot, equipment }: BuildDayPlanInput): DayPlan {
  const counters: PhaseCounters = {};
  const mapped: StepSpec[] = [];
  for (const raw of extractSteps(recipeSnapshot)) {
    const spec = mapStep(raw, counters, equipment);
    if (spec !== null) mapped.push(spec);
  }

  if (mapped.length === 0) return defaultDayPlan();

  return [
    { id: "init", phase: "INITIALIZATION", label: "Initialisation", requiresStabilization: false },
    ...mapped,
  ];
}

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
import type { DayPlan, HopAdditionAlert, MeasurementKind, Phase, StepSpec } from "./types.js";

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
    case "WHIRLPOOL":
      return "WHIRLPOOL";
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
  /**
   * Délai (min) avant le hors-flamme auquel démarre l'**assainissement du
   * circuit de refroidissement** (`Settings.coolingCircuitSanitizeLeadMin`,
   * M9-02). Paramètre métier fourni par l'appelant — `core` n'en code aucune
   * valeur par défaut (ADR-01).
   *
   * **Omis ou ≤ 0 ⇒ aucune étape d'assainissement n'est dérivée.** On préfère ne
   * rien inventer plutôt que de supposer un délai : l'API le lit des `Settings`.
   */
  readonly coolingCircuitSanitizeLeadMin?: number;
  /**
   * Seuil (min de temps d'ébullition **restant**) en deçà duquel un ajout de
   * houblon `use = BOIL` est classé **aromatique** plutôt qu'amérisant (M9-04).
   * Défaut : {@link DEFAULT_AROMA_HOP_THRESHOLD_MIN}. Une valeur non finie
   * retombe sur le défaut.
   */
  readonly aromaHopThresholdMin?: number;
}

/**
 * Seuil par défaut (min de temps restant) séparant ajout **amérisant** et
 * **aromatique** (M9-04, FORMULES §4.3). Motif du choix (~20 min) : au-delà,
 * l'isomérisation des acides alpha domine — l'ajout amérit ; en deçà, les huiles
 * aromatiques sont préservées — l'ajout parfume. Ce n'est pas une constante
 * enfouie : ajustable via {@link BuildDayPlanInput.aromaHopThresholdMin}.
 * Au seuil exact, l'ajout est classé amérisant (« en deçà » strict).
 */
export const DEFAULT_AROMA_HOP_THRESHOLD_MIN = 20;

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
 * type n'a pas de correspondance sur le brassin (CONDITION/PACKAGE/…).
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

    case "WHIRLPOOL": {
      // M9-03 : réintégré au périmètre Jour J (auparavant droppé par le `default`).
      // Le whirlpool ne vise pas une consigne de chauffe — on n'attend donc aucune
      // stabilisation ; il tourne éventuellement pendant une durée déclarée.
      const n = next("WHIRLPOOL");
      return {
        id: `whirlpool-${n}`,
        phase: "WHIRLPOOL",
        label: raw.name ?? "Whirlpool",
        requiresStabilization: false,
        plannedHoldMin: finiteNumber(raw.params.timeMin),
        targetTempC: finiteNumber(raw.params.tempC),
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
        // Le moût doit être **descendu** à la cible pour enchaîner sur
        // l'ensemencement (M9-03, bug « la validation n'avance pas »).
        targetTempConstraint: "at_most",
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
      // STABILIZE, CONDITION, PACKAGE, OTHER : hors périmètre Jour J.
      return null;
  }
}

/**
 * Ajout de houblon tel que lu (défensivement) dans `ingredients` du snapshot.
 * Union discriminée par `use` : le temps restant n'a de sens que pour `BOIL`
 * (`FIRST_WORT` vaut toute l'ébullition, `WHIRLPOOL` se fait à l'étape whirlpool
 * — FORMULES §4.3).
 */
type RawHopAddition =
  | {
      readonly use: "BOIL";
      readonly name: string;
      readonly amountG: number;
      readonly remainingMin: number;
    }
  | { readonly use: "FIRST_WORT"; readonly name: string; readonly amountG: number }
  | { readonly use: "WHIRLPOOL"; readonly name: string; readonly amountG: number };

/**
 * Extrait les ajouts de houblon du snapshot (M9-04). Lecture défensive : toute
 * ligne inexploitable (catégorie absente, nom vide, quantité ou temps non
 * numérique) est **ignorée sans exception**. `DRY_HOP` et les autres moments
 * d'emploi relèvent des jalons de fermentation (M9-05), pas du Jour J.
 */
function extractHopAdditions(snapshot: unknown): readonly RawHopAddition[] {
  // Invariant d'appel : le plan compte ≥ 1 étape mappée, donc le snapshot est un
  // objet non nul (cf. {@link extractSteps}) — une re-garde ici serait inatteignable.
  const ingredients = (snapshot as { ingredients?: unknown }).ingredients;
  if (!Array.isArray(ingredients)) return [];

  const hops: RawHopAddition[] = [];
  for (const entry of ingredients) {
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    if (rec.category !== "HOP") continue;
    if (typeof rec.name !== "string" || rec.name.length === 0) continue;
    const amountG = finiteNumber(rec.amount);
    if (amountG === undefined) continue;

    const use = rec.use;
    if (use === "BOIL") {
      const remainingMin = finiteNumber(rec.timeMinutes);
      if (remainingMin === undefined) continue; // temps non numérique → ligne ignorée
      hops.push({ use, name: rec.name, amountG, remainingMin });
    } else if (use === "FIRST_WORT" || use === "WHIRLPOOL") {
      hops.push({ use, name: rec.name, amountG });
    }
  }
  return hops;
}

/** Tri stable et testable : offset croissant, à égalité par nom (comparaison binaire). */
function byOffsetThenName(a: HopAdditionAlert, b: HopAdditionAlert): number {
  if (a.offsetFromStartMin !== b.offsetFromStartMin) {
    return a.offsetFromStartMin - b.offsetFromStartMin;
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * Attache les échéances de houblonnage aux étapes du plan (M9-04) : ajouts
 * `BOIL`/`FIRST_WORT` sur l'étape d'ébullition, ajouts `WHIRLPOOL` sur l'étape
 * whirlpool (M9-03). Sans étape whirlpool au plan, un ajout `WHIRLPOOL` se
 * **replie** en hors-flamme en fin d'ébullition — l'alerte à l'extinction du feu
 * vaut mieux qu'un ajout silencieusement perdu.
 *
 * Les offsets sont relatifs au **début de l'étape de rattachement**. Appelée
 * **avant** {@link withSanitizeStep} : la scission de l'ébullition conserve son
 * début et sa durée totale, les offsets restent donc valides ; les échéances
 * suivent l'étape `BOIL` principale par recopie (spread).
 *
 * Sans étape d'ébullition de **durée connue**, aucun offset n'est calculable :
 * les ajouts d'ébullition ne sont pas dérivés (on n'invente pas de durée) ;
 * seuls les ajouts `WHIRLPOOL` rattachés à une étape whirlpool subsistent.
 */
function withHopAdditions(
  steps: readonly StepSpec[],
  snapshot: unknown,
  aromaThresholdMin: number,
): StepSpec[] {
  const hops = extractHopAdditions(snapshot);
  const result = [...steps];
  if (hops.length === 0) return result;

  const boilIndex = result.findIndex((s) => s.phase === "BOIL" && s.plannedHoldMin !== undefined);
  const boil = boilIndex >= 0 ? result[boilIndex] : undefined;
  const boilMin = boil?.plannedHoldMin;
  const whirlpoolIndex = result.findIndex((s) => s.phase === "WHIRLPOOL");

  const boilAdditions: HopAdditionAlert[] = [];
  const whirlpoolAdditions: HopAdditionAlert[] = [];

  for (const hop of hops) {
    if (hop.use === "WHIRLPOOL") {
      if (whirlpoolIndex >= 0) {
        whirlpoolAdditions.push({
          name: hop.name,
          amountG: hop.amountG,
          nature: "FLAME_OUT",
          remainingMin: 0,
          offsetFromStartMin: 0, // au démarrage du whirlpool
          inconsistent: false,
        });
      } else if (boilMin !== undefined) {
        boilAdditions.push({
          name: hop.name,
          amountG: hop.amountG,
          nature: "FLAME_OUT",
          remainingMin: 0,
          offsetFromStartMin: boilMin, // repli : à l'extinction du feu
          inconsistent: false,
        });
      }
      continue;
    }

    if (boilMin === undefined) continue;

    if (hop.use === "FIRST_WORT") {
      // FORMULES §4.3 : le first wort vaut toute l'ébullition → amérisant, dès le début.
      boilAdditions.push({
        name: hop.name,
        amountG: hop.amountG,
        nature: "BITTERING",
        remainingMin: boilMin,
        offsetFromStartMin: 0,
        inconsistent: false,
      });
      continue;
    }

    const inconsistent = hop.remainingMin > boilMin;
    boilAdditions.push({
      name: hop.name,
      amountG: hop.amountG,
      nature:
        hop.remainingMin === 0
          ? "FLAME_OUT"
          : hop.remainingMin < aromaThresholdMin
            ? "AROMA"
            : "BITTERING",
      remainingMin: hop.remainingMin,
      offsetFromStartMin: Math.max(0, boilMin - hop.remainingMin),
      inconsistent,
    });
  }

  if (boil !== undefined && boilAdditions.length > 0) {
    result[boilIndex] = { ...boil, hopAdditions: boilAdditions.sort(byOffsetThenName) };
  }
  const whirlpool = result[whirlpoolIndex];
  if (whirlpool !== undefined && whirlpoolAdditions.length > 0) {
    result[whirlpoolIndex] = {
      ...whirlpool,
      hopAdditions: whirlpoolAdditions.sort(byOffsetThenName),
    };
  }
  return result;
}

/**
 * Construit le {@link DayPlan} d'un batch depuis son `recipeSnapshot` (+ profil).
 *
 * Le plan démarre toujours par un jalon `INITIALISATION`, puis reprend, **dans
 * l'ordre de la recette**, les étapes exploitables : empâtage(s) → filtration →
 * ébullition → [assainissement du circuit] → whirlpool → refroidissement →
 * ensemencement. Un empâtage multi-paliers produit autant d'étapes `MASH`
 * (`mash-1`, `mash-2`, …). L'étape d'assainissement est **dérivée**, jamais lue
 * du snapshot (cf. {@link withSanitizeStep}) ; le whirlpool n'apparaît que si la
 * recette en déclare un. Les étapes d'ébullition et de whirlpool portent les
 * **échéances de houblonnage** dérivées des ingrédients du snapshot (M9-04,
 * cf. {@link withHopAdditions}). Le plan est directement consommable par
 * `transition`/`initDayState` (M1-13).
 *
 * @returns le plan dérivé, ou {@link defaultDayPlan} si le snapshot n'expose
 *   aucune étape exploitable (recette vide, snapshot corrompu…).
 */
/**
 * Insère l'étape d'**assainissement du circuit de refroidissement** (M9-03).
 *
 * Pourquoi *dériver* plutôt que lire le snapshot : `recipeSnapshot` est immuable
 * (ADR-07). Les brassins déjà planifiés ne porteront jamais cette étape, et
 * modifier les recettes n'y changerait rien — la seule façon d'en faire
 * bénéficier l'existant est de la calculer.
 *
 * **Découpage de l'ébullition.** L'assainissement consiste à faire circuler le
 * moût **encore bouillant** dans le circuit, juste avant le hors-flamme. Le plan
 * étant une suite d'étapes, on scinde l'ébullition : `boil` tient
 * `durée − délai`, puis l'assainissement tient les `délai` dernières minutes. Le
 * temps d'ébullition **total est conservé**, et l'étape tombe bien pendant
 * l'ébullition — non après, ce qui la viderait de son sens.
 *
 * Conditions : un délai > 0, une étape `BOIL` de **durée connue**, et au moins
 * un refroidissement (sans circuit à assainir, on n'invente pas l'étape).
 * Si la durée d'ébullition est inférieure au délai, l'assainissement occupe
 * toute l'ébullition (l'étape `BOIL` tombe à 0) plutôt que de produire un temps
 * négatif ou d'être omise.
 *
 * ADR-11 : cette étape est un **indicateur d'aide à la décision**. Le vocabulaire
 * évite « stérilisation » / « stérile » — on n'atteste d'aucune innocuité.
 */
function withSanitizeStep(steps: readonly StepSpec[], leadMin: number | undefined): StepSpec[] {
  const result = [...steps];
  if (leadMin === undefined || !Number.isFinite(leadMin) || leadMin <= 0) return result;
  if (!result.some((s) => s.phase === "COOLING")) return result;

  // Dernière ébullition de durée connue (parcours inverse : `findLastIndex` n'est
  // pas dans la cible TS du package). On retient l'étape *et* sa durée dans la
  // boucle : le type est alors resserré sans repli défensif inatteignable.
  let boilIndex = -1;
  let boil: StepSpec | undefined;
  let boilMin = 0;
  for (let i = result.length - 1; i >= 0; i -= 1) {
    const s = result[i];
    if (s !== undefined && s.phase === "BOIL" && s.plannedHoldMin !== undefined) {
      boilIndex = i;
      boil = s;
      boilMin = s.plannedHoldMin;
      break;
    }
  }
  if (boil === undefined) return result;

  const sanitizeMin = Math.min(leadMin, boilMin);

  result[boilIndex] = { ...boil, plannedHoldMin: Math.max(0, boilMin - leadMin) };
  result.splice(boilIndex + 1, 0, {
    id: "boil-sanitize-1",
    phase: "BOIL",
    label: "Assainissement du circuit de refroidissement",
    requiresStabilization: false,
    plannedHoldMin: sanitizeMin,
    targetTempC: BOIL_TARGET_C,
  });
  return result;
}

export function buildDayPlan({
  recipeSnapshot,
  equipment,
  coolingCircuitSanitizeLeadMin,
  aromaHopThresholdMin,
}: BuildDayPlanInput): DayPlan {
  const counters: PhaseCounters = {};
  const mapped: StepSpec[] = [];
  for (const raw of extractSteps(recipeSnapshot)) {
    const spec = mapStep(raw, counters, equipment);
    if (spec !== null) mapped.push(spec);
  }

  if (mapped.length === 0) return defaultDayPlan();

  const withHops = withHopAdditions(
    mapped,
    recipeSnapshot,
    finiteNumber(aromaHopThresholdMin) ?? DEFAULT_AROMA_HOP_THRESHOLD_MIN,
  );

  return [
    { id: "init", phase: "INITIALIZATION", label: "Initialisation", requiresStabilization: false },
    ...withSanitizeStep(withHops, coolingCircuitSanitizeLeadMin),
  ];
}

/**
 * Cycle de vie **post-Jour J** d'un brassin (M9-07) : jalons datés, synthèse des
 * volumes, et progression jusqu'à `TERMINE`.
 *
 * Le serveur est autoritaire (ADR-08). **Aucun calcul de date ni de volume ici** :
 * les dates viennent de `buildBatchMilestones` et la chaîne de `batchVolumeChain`,
 * toutes deux dans `@brasso/core` (ADR-03). Ce service aiguille, persiste et
 * arbitre ; il ne recalcule jamais ce que `core` sait faire — même pour un simple
 * décalage de bornes, sous peine de refaire ici une arithmétique calendaire dans
 * le fuseau du **serveur** au lieu de celui de l'instance (FORMULES §13.1).
 */

import type { BatchMilestone as CoreMilestone, CycleDurations, PackagingLine } from "@brasso/core";
import {
  batchVolumeChain,
  buildBatchMilestones,
  calendarDateInZone,
  packagingYield,
  recipeHasDryHop,
} from "@brasso/core";
import type { BatchMilestoneKind } from "@brasso/db";

import type {
  BatchCycleRepository,
  CycleDefaults,
  MilestoneActualPatch,
  MilestoneView,
  MilestoneWriteData,
} from "./cycle.repository.js";
import type { BatchRepository } from "./repository.js";
import type { MilestoneCreateBody, MilestonePatchBody } from "./schema.js";
import { BatchNotFoundError } from "./service.js";

/** Jalon introuvable sur ce brassin → 404. */
export class MilestoneNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "MILESTONE_NOT_FOUND";
  constructor(batchId: string, kind: string) {
    super(`Le brassin ${batchId} ne comporte pas de jalon ${kind}`);
    this.name = "MilestoneNotFoundError";
  }
}

/**
 * Ajustement refusé : le jalon est **achevé** (`actualEndAt` renseigné) → 409.
 * Le passé constaté n'est pas révisable par un changement de prévision.
 */
export class MilestoneCompletedError extends Error {
  readonly statusCode = 409;
  readonly code = "MILESTONE_COMPLETED";
  constructor(batchId: string, kind: string) {
    super(
      `Le jalon ${kind} du brassin ${batchId} est achevé : sa durée prévue n'est plus modifiable`,
    );
    this.name = "MilestoneCompletedError";
  }
}

/**
 * Vue d'un jalon exposée par l'API : les instants pour l'horodatage, **et** les
 * dates calendaires dans le fuseau de l'instance.
 *
 * Les deux, parce que l'instant seul est un piège : une garde qui s'achève le
 * 10 avril à minuit à Paris se sérialise `2026-04-09T22:00:00Z`, et tout
 * consommateur qui découpe la chaîne ISO affiche la veille. L'agenda (M13) et la
 * liste des brassins (M9-09) doivent lire `…Date`, pas tronquer `…At`.
 */
export interface MilestoneApiView extends MilestoneView {
  /** Date calendaire de début prévue (`YYYY-MM-DD`, fuseau de l'instance). */
  plannedStartDate: string;
  /** Date calendaire de fin prévue (`YYYY-MM-DD`, fuseau de l'instance). */
  plannedEndDate: string;
  /** Date calendaire de début réel, `null` tant qu'il n'est pas constaté. */
  actualStartDate: string | null;
  /** Date calendaire de fin réelle, `null` tant qu'elle n'est pas constatée. */
  actualEndDate: string | null;
  /** `true` dès que `actualEndAt` est renseigné — le jalon n'est plus révisable. */
  completed: boolean;
}

/** Réponse de création : les jalons, et si la séquence préexistait (rejeu offline). */
export interface MilestonesCreateResult {
  milestones: MilestoneApiView[];
  /** `false` si la séquence existait déjà : l'appel a été un no-op (idempotence). */
  created: boolean;
}

/** Un maillon de la chaîne, tel qu'exposé. */
export interface VolumeStepView {
  volumeL: number | null;
  source: "measured" | "estimated" | "unknown";
}

/** Synthèse des volumes d'un brassin (chaîne M9-06 rendue par l'API). */
export interface BatchVolumesView {
  preBoil: VolumeStepView;
  postBoil: VolumeStepView;
  transferred: VolumeStepView;
  pitched: VolumeStepView;
  packaged: VolumeStepView;
  evaporationL: number | null;
  /** Rendement de conditionnement (%), `null` si incalculable (FORMULES §13.2). */
  packagingYieldPercent: number | null;
  /** Avertissements à afficher tels quels (rendement > 100 % ⇒ saisie à vérifier). */
  warnings: string[];
}

/**
 * Phase Jour J (`DayPhase` Prisma) d'où provient chaque volume mesuré. Le volume
 * **transféré** n'y figure pas : aucune étape du Jour J ne le relève, il reste
 * donc estimé depuis le post-ébullition et les pertes.
 */
const PRE_BOIL_PHASE = "FILTRATION";
const POST_BOIL_PHASE = "EBULLITION";
const PITCHED_PHASE = "ENSEMENCEMENT";

/** Jalon ↔ champ de durée correspondant dans {@link CycleDurations}. */
const DURATION_KEY: Record<BatchMilestoneKind, keyof CycleDurations> = {
  FERMENTATION: "fermentationDays",
  DRY_HOP: "dryHopDays",
  COLD_CRASH: "coldCrashDays",
  GARDE: "gardeDays",
};

const NO_DURATIONS: CycleDurations = {
  fermentationDays: 0,
  dryHopDays: 0,
  coldCrashDays: 0,
  gardeDays: 0,
};

/** Jalon persisté → vue API, dates calendaires calculées par `core`. */
const toApiView = (m: MilestoneView, timezone: string): MilestoneApiView => ({
  ...m,
  plannedStartDate: calendarDateInZone(m.plannedStartAt.getTime(), timezone),
  plannedEndDate: calendarDateInZone(m.plannedEndAt.getTime(), timezone),
  actualStartDate:
    m.actualStartAt === null ? null : calendarDateInZone(m.actualStartAt.getTime(), timezone),
  actualEndDate:
    m.actualEndAt === null ? null : calendarDateInZone(m.actualEndAt.getTime(), timezone),
  completed: m.actualEndAt !== null,
});

/** Jalon `core` → données de persistance. */
const toWriteData = (m: CoreMilestone, sortOrder: number): MilestoneWriteData => ({
  kind: m.kind,
  plannedDurationDays: m.plannedDurationDays,
  plannedStartAt: new Date(m.plannedStartAt),
  plannedEndAt: new Date(m.plannedEndAt),
  sortOrder,
});

/** Jalon déjà persisté → données de persistance (conservé tel quel). */
const keepAsIs = (m: MilestoneView, sortOrder: number): MilestoneWriteData => ({
  kind: m.kind,
  plannedDurationDays: m.plannedDurationDays,
  plannedStartAt: m.plannedStartAt,
  plannedEndAt: m.plannedEndAt,
  sortOrder,
});

export class BatchCycleService {
  constructor(
    private readonly cycle: BatchCycleRepository,
    private readonly batches: BatchRepository,
  ) {}

  /**
   * Crée la séquence de jalons à la validation de l'ensemencement.
   *
   * **Idempotent** : le Jour J tourne sur tablette avec une file d'actions
   * rejouée à la reconnexion (ADR-08, M4-14). Rejouer la même validation ne
   * duplique rien et ne produit pas d'erreur — la séquence existante est
   * renvoyée avec `created: false`.
   */
  async createMilestones(
    batchId: string,
    body: MilestoneCreateBody,
  ): Promise<MilestonesCreateResult> {
    const batch = await this.batches.findById(batchId);
    if (!batch) throw new BatchNotFoundError(batchId);

    const defaults = await this.cycle.cycleDefaults();

    const existing = await this.cycle.listMilestones(batchId);
    if (existing.length > 0) {
      return {
        milestones: existing.map((m) => toApiView(m, defaults.timezone)),
        created: false,
      };
    }

    const milestones = buildBatchMilestones({
      pitchedAt: (body.pitchedAt ?? new Date()).getTime(),
      timezone: defaults.timezone,
      durations: resolveDurations(defaults, body),
      // Le dry hop n'existe que si la recette en porte un : la détection est
      // celle de `core`, lue du snapshot figé, jamais redéduite ici.
      hasDryHop: body.hasDryHop ?? recipeHasDryHop(batch.recipeSnapshot),
    });

    const saved = await this.cycle.saveMilestones(
      batchId,
      milestones.map((m, i) => toWriteData(m, i)),
    );
    return { milestones: saved.map((m) => toApiView(m, defaults.timezone)), created: true };
  }

  /** Jalons d'un brassin (404 si le brassin n'existe pas). */
  async listMilestones(batchId: string): Promise<MilestoneApiView[]> {
    const batch = await this.batches.findById(batchId);
    if (!batch) throw new BatchNotFoundError(batchId);
    const { timezone } = await this.cycle.cycleDefaults();
    return (await this.cycle.listMilestones(batchId)).map((m) => toApiView(m, timezone));
  }

  /**
   * Ajuste un jalon : sa **durée prévue** (avec recalcul en cascade des suivants)
   * et/ou ses dates **réelles**.
   *
   * Deux garde-fous : un jalon achevé n'accepte plus de changement de durée
   * (409), et la cascade **ne réécrit jamais** un jalon achevé — elle reprend
   * après lui, à sa date de fin constatée. Le passé constaté prime sur la
   * prévision.
   */
  async patchMilestone(
    batchId: string,
    kind: BatchMilestoneKind,
    body: MilestonePatchBody,
  ): Promise<MilestoneApiView[]> {
    const batch = await this.batches.findById(batchId);
    if (!batch) throw new BatchNotFoundError(batchId);

    const milestones = await this.cycle.listMilestones(batchId);
    const target = milestones.find((m) => m.kind === kind);
    if (!target) throw new MilestoneNotFoundError(batchId, kind);

    const { timezone } = await this.cycle.cycleDefaults();
    if (body.plannedDurationDays !== undefined) {
      if (target.actualEndAt !== null) throw new MilestoneCompletedError(batchId, kind);
      await this.cycle.saveMilestones(
        batchId,
        rechain(milestones, kind, body.plannedDurationDays, timezone),
      );
    }

    const actuals = actualPatchOf(body);
    if (actuals !== undefined) {
      await this.cycle.updateMilestoneActuals(batchId, kind, actuals);
    }

    return (await this.cycle.listMilestones(batchId)).map((m) => toApiView(m, timezone));
  }

  /**
   * Synthèse des volumes d'un brassin : chaîne complète (mesurés et estimés) et
   * rendement de conditionnement. Le calcul entier est délégué à `core` (M9-06) ;
   * ce service se borne à aiguiller chaque mesure vers son maillon.
   */
  async volumes(batchId: string): Promise<BatchVolumesView> {
    const inputs = await this.cycle.getVolumeInputs(batchId);
    if (!inputs) throw new BatchNotFoundError(batchId);

    /** Dernier relevé d'une phase : une reprise de mesure corrige la précédente. */
    const lastOf = (phase: string): number | undefined => {
      let value: number | undefined;
      for (const m of inputs.volumeMeasures) if (m.phase === phase) value = m.value;
      return value;
    };

    const chain = batchVolumeChain({
      preBoilL: lastOf(PRE_BOIL_PHASE),
      postBoilL: lastOf(POST_BOIL_PHASE),
      pitchedL: lastOf(PITCHED_PHASE),
      boilTimeMin: inputs.boilTimeMin ?? undefined,
      ...(inputs.equipment !== null ? { equipment: inputs.equipment } : {}),
      packaging: inputs.packaging as readonly PackagingLine[],
    });

    const yieldResult = packagingYield(chain.preBoil.volumeL, chain.packaged.volumeL);
    return {
      preBoil: chain.preBoil,
      postBoil: chain.postBoil,
      transferred: chain.transferred,
      pitched: chain.pitched,
      packaged: chain.packaged,
      evaporationL: chain.evaporationL,
      packagingYieldPercent: yieldResult.percent,
      warnings: yieldResult.warning !== undefined ? [yieldResult.warning] : [],
    };
  }
}

/** Durées retenues : celles des `Settings`, surchargées par la requête. */
function resolveDurations(defaults: CycleDefaults, body: MilestoneCreateBody): CycleDurations {
  return {
    fermentationDays: body.fermentationDays ?? defaults.fermentationDays,
    dryHopDays: body.dryHopDays ?? defaults.dryHopDays,
    coldCrashDays: body.coldCrashDays ?? defaults.coldCrashDays,
    gardeDays: body.gardeDays ?? defaults.gardeDays,
  };
}

/** Champs réels à écrire, ou `undefined` si la requête n'en porte aucun. */
function actualPatchOf(body: MilestonePatchBody): MilestoneActualPatch | undefined {
  const patch: MilestoneActualPatch = {};
  if (body.actualStartAt !== undefined) patch.actualStartAt = body.actualStartAt;
  if (body.actualEndAt !== undefined) patch.actualEndAt = body.actualEndAt;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/**
 * Recalcule la séquence après changement de durée d'un jalon.
 *
 * Les jalons **achevés** sont conservés à l'identique et la cascade reprend à la
 * fin **constatée** du dernier d'entre eux. Le reste est reconstruit par
 * {@link buildBatchMilestones} : l'ajout de jours reste ainsi calendaire et dans
 * le fuseau de l'instance, au lieu d'être refait ici en millisecondes ou dans le
 * fuseau du serveur.
 *
 * Une durée ramenée à 0 fait **disparaître** la phase (FORMULES §13.1) ; le
 * repository supprime alors le jalon devenu absent de la séquence.
 */
function rechain(
  milestones: readonly MilestoneView[],
  kind: BatchMilestoneKind,
  newDurationDays: number,
  timezone: string,
): MilestoneWriteData[] {
  const ordered = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);

  let lastCompleted = -1;
  for (const [index, m] of ordered.entries()) {
    if (m.actualEndAt !== null) lastCompleted = index;
  }
  const kept = ordered.slice(0, lastCompleted + 1);
  const toReplan = ordered.slice(lastCompleted + 1);

  // Ancrage : fin constatée du dernier jalon achevé, sinon début de la séquence.
  const anchor = kept.at(-1)?.actualEndAt ?? ordered[0]?.plannedStartAt;
  if (anchor === undefined || anchor === null || toReplan.length === 0) {
    return ordered.map((m, i) => keepAsIs(m, i));
  }

  const durations: Record<keyof CycleDurations, number> = { ...NO_DURATIONS };
  for (const m of toReplan) {
    durations[DURATION_KEY[m.kind]] = m.kind === kind ? newDurationDays : m.plannedDurationDays;
  }

  const replanned = buildBatchMilestones({
    pitchedAt: anchor.getTime(),
    timezone,
    durations,
    hasDryHop: toReplan.some((m) => m.kind === "DRY_HOP"),
  });

  return [
    ...kept.map((m, i) => keepAsIs(m, i)),
    ...replanned.map((m, i) => toWriteData(m, kept.length + i)),
  ];
}

/**
 * Service de la **session Jour J** (M4-04, ADR-08) — première brique du pilotage
 * tablette : instancier l'état à partir du plan dérivé (M4-01) et l'exposer.
 *
 * Le **serveur est la source de vérité** : il construit le `DayPlan` depuis le
 * `recipeSnapshot` figé, initialise l'état (`initDayState`, M1-13), le persiste et
 * fournit lui-même `now` pour les timings. Transitions, corrections et rejeu
 * offline sont hors périmètre (M4-05/06/07).
 */

import type {
  BatchStatus,
  DayEvent,
  DayPhase,
  DayPlan,
  DayState,
  DeviationLog,
  MeasurementKind,
  MeasureType,
  PreBoilCorrection,
  StepTiming,
} from "@brasso/core";
import {
  boilGravity,
  buildDayPlan,
  currentStep,
  dayStateSchema,
  initDayState,
  isFinished,
  phaseToDayPhase,
  points,
  realAttenuation,
  stepTiming,
  suggestPreBoilCorrections,
  transition,
} from "@brasso/core";
import type { CorrectionType, Prisma } from "@brasso/db";

import type {
  CorrectionLogRecord,
  DayEventLogEntry,
  DayRepository,
  DaySessionRecord,
  DeviationEffect,
  DeviationRecord,
  MeasureEffect,
} from "./day.repository.js";
import { BatchNotFoundError } from "./service.js";

/** Démarrage refusé : le batch n'est pas dans un statut compatible → 409. */
export class DayNotStartableError extends Error {
  readonly statusCode = 409;
  readonly code = "DAY_NOT_STARTABLE";
  constructor(id: string, status: string) {
    super(`Le batch ${id} (${status}) ne peut pas démarrer le Jour J`);
    this.name = "DayNotStartableError";
  }
}

/** Aucune session Jour J pour ce batch → 404. */
export class DaySessionNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(id: string) {
    super(`Aucune session Jour J pour le batch ${id}`);
    this.name = "DaySessionNotFoundError";
  }
}

/** Événement refusé par la machine (`transition`) : état **inchangé** → 409. */
export class DayEventRejectedError extends Error {
  readonly statusCode = 409;
  readonly code = "DAY_EVENT_REJECTED";
  constructor(reason: string) {
    super(reason);
    this.name = "DayEventRejectedError";
  }
}

/**
 * Cibles pré-ébullition non reconstituables → 422. Le snapshot n'expose pas les
 * paramètres BEER nécessaires (OG/volume/durée d'ébullition) ou l'équipement n'a
 * pas de taux d'évaporation : impossible de proposer une correction chiffrée.
 */
export class PreBoilTargetsUnavailableError extends Error {
  readonly statusCode = 422;
  readonly code = "PREBOIL_TARGETS_UNAVAILABLE";
  constructor(reason: string) {
    super(`Aperçu de correction indisponible : ${reason}`);
    this.name = "PreBoilTargetsUnavailableError";
  }
}

/** Mesure Jour J → type de mesure batch (`BatchMeasure.type`). */
const KIND_TO_MEASURE: Record<MeasurementKind, MeasureType> = {
  density: "GRAVITY",
  temperature: "TEMPERATURE",
  volume: "VOLUME",
  ph: "PH",
};

/** Vue exposée d'une session Jour J : plan, état, timings dérivés, phase Prisma. */
export interface DaySessionView {
  batchStatus: BatchStatus;
  /** Phase côté persistance (Prisma `DayPhase`), dérivée de l'étape courante. */
  phase: DayPhase;
  revision: number;
  plan: DayPlan;
  state: DayState;
  /** Chronométrage de l'étape courante à `now` (serveur), ou `null` si terminé. */
  timings: StepTiming | null;
}

/** Résultat de `start` : `created=false` quand la session existait déjà (idempotent). */
export interface DayStartResult {
  created: boolean;
  day: DaySessionView;
}

/** Vue après application d'un événement — la session + l'éventuel écart produit. */
export interface DayEventView extends DaySessionView {
  /** Intention de log d'écart produite par `FORCE_STEP` (persistée). */
  deviation?: DeviationLog;
}

/** Un événement de la file offline : identifiant client (idempotence) + événement. */
export interface SyncEventInput {
  clientEventId: string;
  event: DayEvent;
}

/** Sort d'un événement rejoué : appliqué, ignoré (déjà vu), ou refusé par la machine. */
export interface SyncEventResult {
  clientEventId: string;
  outcome: "applied" | "skipped" | "rejected";
  rejection?: string;
}

/** Vue après synchro d'une file : la session résultante + le sort de chaque événement. */
export interface DaySyncView extends DaySessionView {
  results: SyncEventResult[];
}

/**
 * Entrée du **journal d'écart** (M4-12), lecture seule : trace d'un forçage
 * (`FORCE_STEP`). Wording neutre côté web — l'écart est une trace, pas une faute.
 */
export interface DeviationView {
  id: string;
  step: string;
  phase: DayPhase | null;
  reason: string;
  /** Nom de l'auteur du forçage (`null` si le compte a été supprimé). */
  author: string | null;
  forcedFromStatus: string | null;
  /** Horodatage métier du forçage, sérialisé ISO 8601. */
  occurredAt: string;
}

/** Mesures pré-ébullition relevées (entrée de l'aperçu de correction, M4-07). */
export interface PreBoilMeasurement {
  /** Densité mesurée avant ébullition (SG brute). */
  measuredGravity: number;
  /** Volume mesuré avant ébullition (L). */
  measuredVolumeL: number;
}

/** Décision de correction retenue à journaliser (M4-07) — append-only. */
export interface CorrectionDecision {
  stepId: string;
  type: CorrectionType;
  /** Proposition retenue (chiffres OG/ABV…), conservée telle quelle en JSONB. */
  payload: Record<string, unknown>;
}

/** Vue d'une décision de correction journalisée (`BatchCorrectionLog`). */
export interface CorrectionLogView {
  id: string;
  stepId: string;
  type: CorrectionType;
  payload: unknown;
  authorId: string | null;
  /** Horodatage de journalisation, sérialisé ISO 8601. */
  createdAt: string;
}

export class BatchDayService {
  constructor(
    private readonly repo: DayRepository,
    /** Horloge serveur (injectable pour les tests). */
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Démarre le Jour J : batch `PLANIFIE`/`EN_BRASSAGE` requis (sinon 409). Dérive
   * le plan, initialise l'état, persiste et passe le batch `EN_BRASSAGE`.
   * **Idempotent** : si une session existe, renvoie l'existante sans réinitialiser.
   */
  async start(batchId: string): Promise<DayStartResult> {
    const existing = await this.repo.getSession(batchId);
    if (existing) {
      return { created: false, day: this.toView(existing) };
    }

    const ctx = await this.repo.getStartContext(batchId);
    if (!ctx) {
      throw new BatchNotFoundError(batchId);
    }
    if (ctx.status !== "PLANIFIE" && ctx.status !== "EN_BRASSAGE") {
      throw new DayNotStartableError(batchId, ctx.status);
    }

    const plan = buildDayPlan({
      recipeSnapshot: ctx.recipeSnapshot,
      equipment: ctx.equipment ?? undefined,
    });
    const state = initDayState(plan);
    const phase = phaseToDayPhase(currentStep(state)?.phase ?? null);

    await this.repo.start(batchId, { phase, state: serialize(state), revision: 0 }, ctx.status);

    const batchStatus: BatchStatus = ctx.status === "PLANIFIE" ? "EN_BRASSAGE" : ctx.status;
    return {
      created: true,
      day: { batchStatus, phase, revision: 0, plan, state, timings: stepTiming(state, this.now()) },
    };
  }

  /** Charge la session Jour J d'un batch (plan + état + timings). 404 si absente. */
  async get(batchId: string): Promise<DaySessionView> {
    const session = await this.repo.getSession(batchId);
    if (!session) {
      throw new DaySessionNotFoundError(batchId);
    }
    return this.toView(session);
  }

  /**
   * Applique un `DayEvent` (cœur du Jour J, ADR-08) : recharge l'état, exécute la
   * machine pure `transition` (M1-13). Rejet → 409, **état inchangé**. Sinon
   * persiste le nouvel état (`revision + 1`), la `phase`, les effets
   * (`RECORD_MEASUREMENT` → `BatchMeasure`, `FORCE_STEP` → `DeviationLog`) et clôt
   * le brassin (`EN_FERMENTATION`) en fin de parcours — le tout en transaction.
   */
  async applyEvent(batchId: string, event: DayEvent, userId: string | null): Promise<DayEventView> {
    const session = await this.repo.getSession(batchId);
    if (!session) {
      throw new DaySessionNotFoundError(batchId);
    }
    const state = dayStateSchema.parse(session.state) as DayState;

    const result = transition(state, event);
    if (result.rejection !== undefined) {
      throw new DayEventRejectedError(result.rejection);
    }

    const newState = result.state;
    const finished = isFinished(newState);
    const phase = phaseToDayPhase(currentStep(newState)?.phase ?? null);
    const revision = session.revision + 1;

    await this.repo.applyEvent(batchId, {
      phase,
      state: serialize(newState),
      revision,
      finished,
      measure: measureEffect(event, phase, userId),
      deviation: deviationEffect(result.deviation, userId),
      actorId: userId,
    });

    const batchStatus: BatchStatus = finished ? "EN_FERMENTATION" : session.batchStatus;
    return {
      batchStatus,
      phase,
      revision,
      plan: newState.plan,
      state: newState,
      timings: stepTiming(newState, this.now()),
      ...(result.deviation ? { deviation: result.deviation } : {}),
    };
  }

  /**
   * Rejoue une **file d'événements offline** (M4-06, critère de démo « wifi coupé
   * sans perte »). Les événements sont appliqués **dans l'ordre** (tri par `at`) et
   * de façon **idempotente** : un `clientEventId` déjà journalisé est ignoré (aucune
   * ré-application). Un rejet en milieu de file **n'interrompt pas** les suivants.
   * L'état final est persisté une fois, en transaction (ADR-08).
   */
  async sync(
    batchId: string,
    events: readonly SyncEventInput[],
    userId: string | null,
  ): Promise<DaySyncView> {
    const session = await this.repo.getSession(batchId);
    if (!session) {
      throw new DaySessionNotFoundError(batchId);
    }

    // Ordre déterministe par horodatage capté hors-ligne (déterminisme M1-13).
    const ordered = [...events].sort((a, b) => a.event.at - b.event.at);
    const known = await this.repo.findEventLogs(
      batchId,
      ordered.map((e) => e.clientEventId),
    );

    let state = dayStateSchema.parse(session.state) as DayState;
    let revision = session.revision;
    let changed = false;
    const measures: MeasureEffect[] = [];
    const deviations: DeviationEffect[] = [];
    const eventLogs: DayEventLogEntry[] = [];
    const results: SyncEventResult[] = [];
    const seen = new Set<string>();

    for (const { clientEventId, event } of ordered) {
      const prior = known.get(clientEventId);
      if (prior || seen.has(clientEventId)) {
        // Déjà appliqué (ou doublon dans la même file) → aucun effet, résultat mémorisé.
        results.push({
          clientEventId,
          outcome: "skipped",
          ...(prior?.rejection ? { rejection: prior.rejection } : {}),
        });
        continue;
      }
      seen.add(clientEventId);

      const result = transition(state, event);
      if (result.rejection !== undefined) {
        eventLogs.push({
          clientEventId,
          type: event.type,
          resultRevision: revision,
          rejected: true,
          rejection: result.rejection,
        });
        results.push({ clientEventId, outcome: "rejected", rejection: result.rejection });
        continue;
      }

      state = result.state;
      revision += 1;
      changed = true;
      const phaseNow = phaseToDayPhase(currentStep(state)?.phase ?? null);
      const measure = measureEffect(event, phaseNow, userId);
      if (measure) measures.push(measure);
      const deviation = deviationEffect(result.deviation, userId);
      if (deviation) deviations.push(deviation);
      eventLogs.push({
        clientEventId,
        type: event.type,
        resultRevision: revision,
        rejected: false,
        rejection: null,
      });
      results.push({ clientEventId, outcome: "applied" });
    }

    const finished = changed && isFinished(state);
    const phase = phaseToDayPhase(currentStep(state)?.phase ?? null);

    await this.repo.commitSync(batchId, {
      changed,
      phase,
      state: serialize(state),
      revision,
      finished,
      measures,
      deviations,
      eventLogs,
      actorId: userId,
    });

    const batchStatus: BatchStatus = finished ? "EN_FERMENTATION" : session.batchStatus;
    return {
      batchStatus,
      phase,
      revision,
      plan: state.plan,
      state,
      timings: stepTiming(state, this.now()),
      results,
    };
  }

  /**
   * Journal des écarts de procédure du batch (M4-12) — **lecture seule** : liste
   * les `FORCE_STEP` tracés (étape, phase, motif, auteur, date), du plus ancien au
   * plus récent. Renvoie une liste vide si aucun forçage (pas de 404 : consultation).
   */
  async deviations(batchId: string): Promise<DeviationView[]> {
    const rows = await this.repo.listDeviations(batchId);
    return rows.map(toDeviationView);
  }

  /**
   * **Aperçu** de corrections densité pré-ébullition (M4-07, ADR-11 — aide à la
   * décision, jamais prescriptif) : reconstitue les cibles du modèle depuis le
   * `recipeSnapshot` figé + le taux d'évaporation de l'équipement, puis délègue le
   * calcul chiffré à `suggestPreBoilCorrections` (core M4-02). **Aucune écriture.**
   *
   * @throws {@link BatchNotFoundError} si le batch n'existe pas (404).
   * @throws {@link PreBoilTargetsUnavailableError} si le snapshot n'expose pas les
   *   cibles BEER requises ou l'équipement n'a pas de taux d'évaporation (422).
   */
  async previewCorrections(
    batchId: string,
    measurement: PreBoilMeasurement,
  ): Promise<PreBoilCorrection> {
    const ctx = await this.repo.getCorrectionContext(batchId);
    if (!ctx) {
      throw new BatchNotFoundError(batchId);
    }
    const targets = reconstitutePreBoilTargets(ctx.recipeSnapshot, ctx.evaporationRateLPerHour);
    return suggestPreBoilCorrections({
      measuredGravity: measurement.measuredGravity,
      measuredVolumeL: measurement.measuredVolumeL,
      ...targets,
    });
  }

  /**
   * **Journalise** la décision de correction retenue (`BatchCorrectionLog`, M4-03).
   * Append-only : la correction est une **trace de décision**, sans impact sur la
   * state machine (aucune transition). `authorId` = utilisateur courant.
   *
   * @throws {@link BatchNotFoundError} si le batch n'existe pas (404).
   */
  async logCorrection(
    batchId: string,
    decision: CorrectionDecision,
    userId: string | null,
  ): Promise<CorrectionLogView> {
    const ctx = await this.repo.getCorrectionContext(batchId);
    if (!ctx) {
      throw new BatchNotFoundError(batchId);
    }
    const record = await this.repo.logCorrection(batchId, {
      stepId: decision.stepId,
      type: decision.type,
      payload: toJson(decision.payload),
      authorId: userId,
    });
    return toCorrectionView(record);
  }

  /** Reconstruit la vue depuis l'instantané persisté (validé par `dayStateSchema`). */
  private toView(record: DaySessionRecord): DaySessionView {
    const state = dayStateSchema.parse(record.state) as DayState;
    return {
      batchStatus: record.batchStatus,
      phase: record.phase,
      revision: record.revision,
      plan: state.plan,
      state,
      timings: stepTiming(state, this.now()),
    };
  }
}

/** Effet mesure d'un `RECORD_MEASUREMENT` (sinon `undefined`) — phase courante. */
function measureEffect(
  event: DayEvent,
  phase: DayPhase,
  userId: string | null,
): MeasureEffect | undefined {
  if (event.type !== "RECORD_MEASUREMENT") return undefined;
  return {
    type: KIND_TO_MEASURE[event.kind],
    value: event.value,
    phase,
    loggedById: userId,
    loggedAt: new Date(event.at),
  };
}

/** Effet écart d'un `FORCE_STEP` (depuis l'intention core), sinon `undefined`. */
function deviationEffect(
  deviation: DeviationLog | undefined,
  userId: string | null,
): DeviationEffect | undefined {
  if (!deviation) return undefined;
  return {
    step: deviation.stepId,
    phase: phaseToDayPhase(deviation.phase),
    reason: deviation.reason,
    authorId: userId,
    forcedFromStatus: deviation.forcedFromStatus,
    occurredAt: new Date(deviation.at),
  };
}

/** Projette un écart persisté (`DeviationRecord`) vers sa vue journal (date ISO). */
function toDeviationView(record: DeviationRecord): DeviationView {
  return {
    id: record.id,
    step: record.step,
    phase: record.phase,
    reason: record.reason,
    author: record.authorName,
    forcedFromStatus: record.forcedFromStatus,
    occurredAt: record.occurredAt.toISOString(),
  };
}

/** Projette une ligne `BatchCorrectionLog` persistée vers sa vue (date ISO). */
function toCorrectionView(record: CorrectionLogRecord): CorrectionLogView {
  return {
    id: record.id,
    stepId: record.stepId,
    type: record.type,
    payload: record.payload,
    authorId: record.authorId,
    createdAt: record.createdAt.toISOString(),
  };
}

/** Atténuation apparente par défaut (%) quand la recette n'expose pas de FG cible. */
const DEFAULT_ATTENUATION_PCT = 75;

/** Lecture défensive d'un objet JSON (`null` si valeur non-objet), comme `buildDayPlan`. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Lecture défensive d'un nombre fini ; `undefined` sinon. */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Cibles du modèle attendues par `suggestPreBoilCorrections` (hors mesures). */
type PreBoilTargets = Pick<
  Parameters<typeof suggestPreBoilCorrections>[0],
  | "targetPreBoilGravity"
  | "targetPreBoilVolumeL"
  | "targetOg"
  | "evaporationRateLPerHour"
  | "plannedBoilTimeMin"
  | "expectedAttenuationPct"
>;

/**
 * Reconstitue les **cibles pré-ébullition du modèle** depuis le `recipeSnapshot`
 * figé (moteur BEER) et le taux d'évaporation de l'équipement — miroir de la façon
 * dont M4-02 les consomme (FORMULES §4.2 pour la densité pré-ébullition, §9.2 pour
 * l'atténuation apparente attendue).
 *
 * - `targetOg`, `plannedBoilTimeMin`, volume final = `beerDetails.{targetOg,
 *   boilTimeMin, batchVolumeL}` ; `evaporationRate` = profil d'équipement.
 * - `targetPreBoilVolumeL = batchVolumeL + évaporation planifiée` ; la densité
 *   pré-ébullition cible en découle par conservation de l'extrait (`boilGravity`).
 * - `expectedAttenuationPct` = atténuation apparente `targetOg → targetFg` si la
 *   recette porte une FG plausible, sinon un défaut (75 %).
 *
 * Lecture **défensive** du snapshot (JSONB opaque) ; toute cible manquante ou
 * incohérente lève {@link PreBoilTargetsUnavailableError} plutôt qu'une exception
 * brute (aperçu simplement indisponible pour ce batch).
 */
function reconstitutePreBoilTargets(
  snapshot: unknown,
  evaporationRateLPerHour: number | null,
): PreBoilTargets {
  const beer = asRecord(asRecord(snapshot)?.beerDetails);
  const targetOg = finiteNumber(beer?.targetOg);
  const batchVolumeL = finiteNumber(beer?.batchVolumeL);
  const plannedBoilTimeMin = finiteNumber(beer?.boilTimeMin);
  const evaporation = finiteNumber(evaporationRateLPerHour ?? undefined);

  if (targetOg === undefined || !(targetOg > 1)) {
    throw new PreBoilTargetsUnavailableError("OG cible absente du snapshot (moteur BEER requis)");
  }
  if (batchVolumeL === undefined || !(batchVolumeL > 0)) {
    throw new PreBoilTargetsUnavailableError("volume de brassin cible absent du snapshot");
  }
  if (plannedBoilTimeMin === undefined || !(plannedBoilTimeMin > 0)) {
    throw new PreBoilTargetsUnavailableError("durée d'ébullition absente du snapshot");
  }
  if (evaporation === undefined || !(evaporation > 0)) {
    throw new PreBoilTargetsUnavailableError(
      "taux d'évaporation du profil d'équipement absent ou nul",
    );
  }

  const plannedEvapL = (evaporation * plannedBoilTimeMin) / 60;
  const targetPreBoilVolumeL = batchVolumeL + plannedEvapL;
  // Densité pré-ébullition = OG rapportée au volume avant évaporation (§4.2).
  const targetPreBoilGravity = boilGravity(points(targetOg), batchVolumeL, targetPreBoilVolumeL);

  const targetFg = finiteNumber(beer?.targetFg);
  const expectedAttenuationPct =
    targetFg !== undefined && targetFg > 1 && targetFg < targetOg
      ? realAttenuation(targetOg, targetFg)
      : DEFAULT_ATTENUATION_PCT;

  return {
    targetPreBoilGravity,
    targetPreBoilVolumeL,
    targetOg,
    evaporationRateLPerHour: evaporation,
    plannedBoilTimeMin,
    expectedAttenuationPct,
  };
}

/** Sérialise une valeur JSON quelconque vers une valeur persistable (JSONB). */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Sérialise l'instantané core vers une valeur JSON persistable (JSONB). */
function serialize(state: DayState): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue;
}

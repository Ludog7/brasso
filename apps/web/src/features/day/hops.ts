/**
 * Échéancier des **ajouts de houblon** de l'étape courante (M9-11, §E) — logique
 * pure, sans React ni réseau, pour être testable seule.
 *
 * Les échéances viennent du plan (`StepSpec.hopAdditions`, M9-04) sous forme
 * d'**offsets** en minutes depuis le début de l'étape porteuse. `core` ne lit
 * jamais l'horloge (ADR-03) : c'est ici qu'on **ancre** ces offsets sur un
 * instant réel. Cet ancrage est purement local — aucune requête sur le chemin
 * d'une alerte, ce qui est la condition pour qu'elles fonctionnent **hors ligne**
 * (§F, wifi d'atelier instable).
 */

import type { DayState, HopAdditionAlert, StepSpec } from "@brasso/core";

/**
 * Préavis (ms) avant l'échéance : le brasseur doit avoir le temps de peser et
 * d'ouvrir le sachet avant le moment de l'ajout. Deux minutes couvrent le geste
 * sans noyer l'écran d'alertes anticipées.
 */
export const HOP_ALERT_LEAD_MS = 120_000;

/** Où en est un ajout vis-à-vis de son échéance. */
export type HopAlertStatus =
  /** Échéance lointaine : simple ligne d'anticipation. */
  | "upcoming"
  /** Échéance proche ({@link HOP_ALERT_LEAD_MS}) : préparer la pesée. */
  | "soon"
  /** Échéance atteinte : alerte, tant que l'opérateur n'a pas acquitté. */
  | "due"
  /** Acquitté par l'opérateur — l'ajout est fait. */
  | "done";

/** Un ajout de houblon situé dans le temps réel. */
export interface ScheduledHopAddition {
  /** Clé stable dans le plan (`<stepId>#<rang>`) — sert à l'acquittement. */
  readonly key: string;
  readonly addition: HopAdditionAlert;
  /** Instant d'échéance (epoch ms), ou `null` si l'étape n'a pas encore démarré. */
  readonly dueAt: number | null;
  /** Temps restant avant l'échéance (ms, négatif si dépassée) ; `null` si non ancré. */
  readonly remainingMs: number | null;
  readonly status: HopAlertStatus;
}

/**
 * Instant depuis lequel compter les offsets de l'étape, ou `null` si l'étape n'a
 * pas commencé.
 *
 * Le point d'ancrage n'est pas toujours le démarrage de l'étape : sur une étape
 * à stabilisation (l'ébullition), le compte à rebours des houblons part de
 * l'**ébullition effective** — pas du début de la chauffe, sinon toutes les
 * échéances seraient avancées de la durée de montée en température. Le timer
 * armé fait autorité quand il existe : il porte l'horodatage **serveur**
 * (ADR-08), donc le même pour tous les écrans branchés sur le brassin.
 */
export function hopScheduleAnchor(state: DayState, step: StepSpec): number | null {
  if (state.timer?.stepId === step.id) return state.timer.startedAt;
  if (step.requiresStabilization) return state.stabilizedAt;
  return state.stepStartedAt;
}

/**
 * Situe chaque ajout de houblon de l'étape dans le temps, à l'instant `now`.
 *
 * Sans ancrage (étape pas encore démarrée), les ajouts restent listés avec leur
 * offset : c'est ce qui permet à l'opérateur d'**anticiper la pesée** avant
 * d'allumer le feu. Aucun n'est alors « dû » — on n'alerte pas sur une échéance
 * qui n'a pas de date.
 */
export function buildHopSchedule(
  step: StepSpec,
  state: DayState,
  now: number,
  acknowledged: ReadonlySet<string>,
  leadMs: number = HOP_ALERT_LEAD_MS,
): ScheduledHopAddition[] {
  const anchor = hopScheduleAnchor(state, step);

  return (step.hopAdditions ?? []).map((addition, index) => {
    const key = `${step.id}#${index}`;
    if (acknowledged.has(key)) {
      return { key, addition, dueAt: null, remainingMs: null, status: "done" };
    }
    if (anchor === null) {
      return { key, addition, dueAt: null, remainingMs: null, status: "upcoming" };
    }

    const dueAt = anchor + addition.offsetFromStartMin * 60_000;
    const remainingMs = dueAt - now;
    const status: HopAlertStatus =
      remainingMs <= 0 ? "due" : remainingMs <= leadMs ? "soon" : "upcoming";
    return { key, addition, dueAt, remainingMs, status };
  });
}

/**
 * Signature de l'échéancier (clé + statut) — deux rendus qui la partagent
 * n'appellent pas de nouvelle alerte. Évite de déclencher un effet à chaque
 * battement de l'horloge alors que rien n'a changé pour l'opérateur.
 */
export function hopScheduleSignature(schedule: readonly ScheduledHopAddition[]): string {
  return schedule.map((item) => `${item.key}:${item.status}`).join("|");
}

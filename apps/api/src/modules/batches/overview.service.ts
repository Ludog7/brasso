/**
 * Vue « Brassins » enrichie (M9-09) : pour chaque brassin, son étape courante et
 * sa **prochaine échéance datée**, en un seul appel.
 *
 * Sans cette agrégation, la liste devrait interroger une route par brassin (N+1)
 * pour afficher trois colonnes. Elle sert la vue Brassins (M9-10) et deux tuiles
 * du tableau de bord (M13).
 *
 * Lecture du `recipeSnapshot` **défensive** : un snapshot ancien ou corrompu ne
 * doit pas faire échouer la liste entière — un brassin sans nom lisible se
 * replie sur son numéro.
 */

import { calendarDateInZone } from "@brasso/core";
import type { BatchStatus } from "@brasso/db";

import type {
  BatchOverviewFilters,
  BatchOverviewRow,
  BatchRepository,
  BrewedVolumeSummary,
} from "./repository.js";
import type { BatchOverviewQuery } from "./schema.js";

/** Étape courante d'un brassin, telle qu'affichée en liste. */
export interface CurrentStepView {
  /** D'où vient l'étape : session Jour J en cours, ou jalon du cycle. */
  source: "DAY" | "MILESTONE";
  /** Phase Jour J (`EBULLITION`…) ou jalon (`FERMENTATION`…). */
  code: string;
}

/** Échéance datée : l'instant **et** la date calendaire (cf. M9-07). */
export interface DeadlineView {
  code: string;
  at: string;
  date: string;
}

/** Un brassin dans la vue liste. */
export interface BatchOverview {
  id: string;
  batchNumber: number;
  /** Nom lu du snapshot ; repli sur le numéro si illisible. */
  recipeName: string;
  /** Moteur de recette (`BEER`…), `null` si le snapshot ne le porte pas. */
  engine: string | null;
  status: BatchStatus;
  plannedAt: Date | null;
  brewedAt: Date | null;
  completedAt: Date | null;
  /** Étape en cours, `null` pour un brassin non démarré ou clos. */
  currentStep: CurrentStepView | null;
  /** Prochain jalon non achevé — ce qui réclame une action. */
  nextDeadline: DeadlineView | null;
  /** Fin prévue du cycle (dernier jalon). */
  plannedEndAt: string | null;
  plannedEndDate: string | null;
}

/** Page de résultats de la vue « Brassins ». */
export interface BatchOverviewPage {
  items: BatchOverview[];
  total: number;
  limit: number;
  offset: number;
}

/** Statuts considérés comme « en cours » — ceux qui réclament encore une action. */
const ONGOING: ReadonlySet<BatchStatus> = new Set<BatchStatus>([
  "PLANIFIE",
  "EN_BRASSAGE",
  "EN_FERMENTATION",
  "EN_CONDITIONNEMENT",
]);

/** Taille de page par défaut et plafond — la tablette ne doit pas tout charger. */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Chaîne non vide lue défensivement dans le snapshot JSONB opaque. */
function snapshotString(snapshot: unknown, key: string): string | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export class BatchOverviewService {
  constructor(
    private readonly repo: BatchRepository,
    /** Fuseau de l'instance, pour les dates calendaires exposées. */
    private readonly timezone: () => Promise<string>,
  ) {}

  /**
   * Liste enrichie, triée puis paginée.
   *
   * **Tri par défaut** : brassins en cours d'abord, puis par prochaine échéance
   * croissante — l'ordre utile à l'atelier, où ce qui réclame une action doit
   * apparaître en tête. Un brassin en cours sans échéance datée passe après ceux
   * qui en ont une (il n'y a rien à anticiper), mais avant les brassins clos.
   *
   * Le tri dépend des jalons et ne s'exprime pas en `ORDER BY` simple : il est
   * donc appliqué ici, sur l'ensemble **filtré**, avant pagination. Le coût
   * reste borné par les filtres et par la taille réelle d'une brasserie
   * associative ; l'interdiction du N+1 porte sur les requêtes par brassin, que
   * le repository évite en chargeant tout en une fois.
   */
  async list(query: BatchOverviewQuery): Promise<BatchOverviewPage> {
    const filters: BatchOverviewFilters = {
      ...(query.status !== undefined ? { statuses: query.status } : {}),
      ...(query.recipeId !== undefined ? { recipeId: query.recipeId } : {}),
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
    };

    const [rows, timezone] = await Promise.all([this.repo.listOverview(filters), this.timezone()]);

    const scoped = rows.filter((row) => {
      if (query.scope === "ongoing") return ONGOING.has(row.status);
      if (query.scope === "finished") return !ONGOING.has(row.status);
      return true;
    });

    const items = scoped.map((row) => toOverview(row, timezone));
    items.sort(byUrgency);

    const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = query.offset ?? 0;
    return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
  }

  /**
   * Volume brassé sur une période (M9-09 §E) : produit ici plutôt que recalculé
   * par le tableau de bord, pour qu'une agrégation métier n'existe pas en double
   * côté front.
   */
  brewedVolume(query: { from?: Date; to?: Date }): Promise<BrewedVolumeSummary> {
    return this.repo.brewedVolume(query.from, query.to);
  }
}

/** Ligne brute → vue liste. */
function toOverview(row: BatchOverviewRow, timezone: string): BatchOverview {
  const ongoing = ONGOING.has(row.status);
  // Premier jalon non achevé : c'est lui qui porte la prochaine échéance.
  const next = row.milestones.find((m) => m.actualEndAt === null);
  const last = row.milestones.at(-1);

  return {
    id: row.id,
    batchNumber: row.batchNumber,
    // Repli sur le numéro : un snapshot illisible ne doit pas vider la liste.
    recipeName: snapshotString(row.recipeSnapshot, "name") ?? `Brassin n°${row.batchNumber}`,
    engine: snapshotString(row.recipeSnapshot, "engine"),
    status: row.status,
    plannedAt: row.plannedAt,
    brewedAt: row.brewedAt,
    completedAt: row.completedAt,
    currentStep: currentStepOf(row, ongoing, next?.kind ?? null),
    nextDeadline:
      ongoing && next !== undefined
        ? {
            code: next.kind,
            at: next.plannedEndAt.toISOString(),
            date: calendarDateInZone(next.plannedEndAt.getTime(), timezone),
          }
        : null,
    plannedEndAt: last?.plannedEndAt.toISOString() ?? null,
    plannedEndDate:
      last === undefined ? null : calendarDateInZone(last.plannedEndAt.getTime(), timezone),
  };
}

/**
 * Étape courante : la phase du Jour J tant qu'une session tourne, sinon le
 * premier jalon non achevé. Un brassin clos ou annulé n'a plus d'étape.
 */
function currentStepOf(
  row: BatchOverviewRow,
  ongoing: boolean,
  nextMilestone: string | null,
): CurrentStepView | null {
  if (!ongoing) return null;
  if (row.status === "EN_BRASSAGE" && row.dayPhase !== null) {
    return { source: "DAY", code: row.dayPhase };
  }
  return nextMilestone === null ? null : { source: "MILESTONE", code: nextMilestone };
}

/**
 * Ordre d'affichage : en cours d'abord, puis échéance la plus proche. À défaut
 * d'échéance, le brassin le plus récent d'abord — l'atelier raisonne sur ce
 * qu'il vient de faire.
 */
function byUrgency(a: BatchOverview, b: BatchOverview): number {
  const aOngoing = ONGOING.has(a.status);
  const bOngoing = ONGOING.has(b.status);
  if (aOngoing !== bOngoing) return aOngoing ? -1 : 1;

  const aAt = a.nextDeadline?.at ?? null;
  const bAt = b.nextDeadline?.at ?? null;
  if (aAt !== null && bAt !== null && aAt !== bAt) return aAt < bAt ? -1 : 1;
  if (aAt !== null && bAt === null) return -1;
  if (aAt === null && bAt !== null) return 1;

  return b.batchNumber - a.batchNumber;
}

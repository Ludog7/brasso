/**
 * State Machine « Jour J » — types purs (états, événements, transitions).
 *
 * SOURCE DE VÉRITÉ MÉTIER : `docs/SPEC-FONCTIONNELLE.md` (« State Machine Jour J
 * tolérante »). ADR-08 : le **serveur** est la source de vérité, le client un
 * cache résilient — la machine est donc **pure et déterministe** : aucune lecture
 * d'horloge interne, tout instant (`at`) arrive via les événements (horodatage
 * serveur à la synchro). Zéro dépendance UI/DB (ADR-03).
 *
 * Unités (CLAUDE.md) : durées en **minutes**, températures en °C, densité en SG
 * brute, volumes en L, instants en **epoch ms**.
 */

/**
 * Phases canoniques du Jour J (spec « Structure des étapes »).
 *
 * `WHIRLPOOL` (M9-03) s'intercale entre `BOIL` et `COOLING`. Elle est
 * **optionnelle** — tous les brassins n'en comportent pas — et n'apparaît donc
 * dans un plan que si la recette déclare une étape `WHIRLPOOL` ; elle ne fait
 * volontairement pas partie de {@link CANONICAL_PHASES} ni du plan par défaut.
 */
export type Phase =
  "INITIALIZATION" | "MASH" | "LAUTER" | "BOIL" | "WHIRLPOOL" | "COOLING" | "PITCHING";

/** Nature d'une mesure saisie pendant le brassage. */
export type MeasurementKind = "density" | "volume" | "temperature" | "ph";

/**
 * Origine d'une mesure — **point d'extension IoT** (spec §Extensibilité) : une
 * sonde/densimètre alimente la même machine sans coupler le cœur. Défaut `manual`.
 */
export type MeasurementSource = "manual" | "sensor";

/**
 * Spécification d'une étape du plan (le « modèle » dérivé de la recette / du
 * profil matériel). Le plan est une liste ordonnée de `StepSpec` : répéter une
 * phase `MASH` modélise naturellement un empâtage multi-paliers.
 */
export interface StepSpec {
  /** Identifiant stable de l'étape (ex. `"mash-1"`). */
  readonly id: string;
  readonly phase: Phase;
  /** Libellé lisible (optionnel). */
  readonly label?: string;
  /**
   * Le timer de palier n'est **armé qu'après stabilisation confirmée** (feature
   * sanctuarisée). Si `false`, un éventuel timer démarre au lancement de l'étape.
   */
  readonly requiresStabilization: boolean;
  /** Durée planifiée du palier / hold (min) — arme le timer. Absente → pas de timer. */
  readonly plannedHoldMin?: number;
  /** Temps de montée en chauffe estimé (min) — comparé au réel pour calibration (M3). */
  readonly plannedRampMin?: number;
  /** Température cible du palier (°C), indicative. */
  readonly targetTempC?: number;
  /**
   * Si défini, la validation en mode normal exige que la **dernière température
   * relevée** sur l'étape respecte {@link targetTempC} dans ce sens (M9-03) :
   * - `at_most` — refroidissement : le moût doit être **descendu** à la cible ;
   * - `at_least` — chauffe : la cible doit être **atteinte**.
   *
   * Sans {@link targetTempC}, la contrainte est ignorée (rien à comparer).
   * Une contrainte non satisfaite **refuse** la validation mais ne fait jamais
   * perdre les mesures déjà saisies — c'est le correctif du bug « la validation
   * du refroidissement n'enchaîne pas ».
   */
  readonly targetTempConstraint?: "at_most" | "at_least";
  /** Mesures exigées pour **valider en mode normal** (ignorées si on force l'étape). */
  readonly requiredMeasurements?: readonly MeasurementKind[];
}

/**
 * Verdict de validabilité de l'étape courante (M9-03) — **contrat explicite**
 * pour l'écran, qui ne doit pas déduire ce qu'il a le droit de proposer par
 * l'absence d'un champ.
 *
 * Distinction essentielle : `canValidate` décrit une progression **nominale**
 * (aucun écart de procédure). « Forcer l'étape » reste toujours possible, mais
 * produit un {@link DeviationLog} — il ne doit donc pas servir à avancer sur une
 * étape qui n'a simplement pas de timer.
 */
export interface StepValidationCheck {
  /** L'étape peut-elle être validée maintenant, sans écart ? */
  readonly canValidate: boolean;
  /** Motifs de blocage (vide si {@link canValidate}), rédigés pour l'affichage. */
  readonly blockedBy: readonly string[];
  /**
   * L'étape n'a **aucune barrière temporelle** (ni palier, ni stabilisation) :
   * elle attend une validation explicite de l'opérateur. C'est ce qui doit faire
   * apparaître un bouton « Valider l'étape » — sans quoi une filtration sans
   * timer laisse l'écran sans issue (bug M9-03).
   */
  readonly awaitsManualValidation: boolean;
}

/** Plan du Jour J : suite ordonnée d'étapes (le modèle). */
export type DayPlan = readonly StepSpec[];

/**
 * Statut de l'étape courante.
 * - `PENDING` : pas encore démarrée.
 * - `AWAITING_STABILIZATION` : en attente de stabilisation température (palier sanctuarisé).
 * - `TIMER_RUNNING` : timer de palier en cours.
 * - `AWAITING_VALIDATION` : conditions à vérifier / validation opérateur.
 * - `COMPLETED` : plus d'étape courante — le brassin est terminé.
 */
export type StepStatus =
  "PENDING" | "AWAITING_STABILIZATION" | "TIMER_RUNNING" | "AWAITING_VALIDATION" | "COMPLETED";

/** Mesure enregistrée pendant le brassage. */
export interface Measurement {
  readonly kind: MeasurementKind;
  readonly value: number;
  /** Instant de la saisie (epoch ms). */
  readonly at: number;
  /** Étape pendant laquelle la mesure a été saisie. */
  readonly stepId: string;
  /** Origine (point d'extension IoT). */
  readonly source: MeasurementSource;
}

/** Timer de palier armé (sanctuarisé : n'existe qu'après stabilisation si requise). */
export interface TimerState {
  readonly stepId: string;
  /** Instant d'armement du timer (epoch ms) — horodatage serveur (ADR-08). */
  readonly startedAt: number;
  /** Durée planifiée du palier (min). */
  readonly plannedHoldMin: number;
}

/** État complet du Jour J — snapshot sérialisable, sans dépendance externe. */
export interface DayState {
  readonly plan: DayPlan;
  /** Index de l'étape courante ; `=== plan.length` quand le brassin est terminé. */
  readonly cursor: number;
  readonly status: StepStatus;
  /** Instant de démarrage de l'étape courante (`START_STEP`), pour le temps de montée réel. */
  readonly stepStartedAt: number | null;
  /** Instant de confirmation de stabilisation de l'étape courante. */
  readonly stabilizedAt: number | null;
  /** Timer de palier actif (ou `null`). */
  readonly timer: TimerState | null;
  readonly measurements: readonly Measurement[];
  /** Ids des étapes déjà validées/forcées, dans l'ordre. */
  readonly completedStepIds: readonly string[];
}

/**
 * Intention de log d'écart de procédure produite par « Forcer l'étape ».
 * La couche appelante la persiste (`BatchDeviation`, M4) — ADR-08.
 */
export interface DeviationLog {
  readonly stepId: string;
  readonly phase: Phase;
  /** Auteur du forçage. */
  readonly author: string;
  /** Date/heure du forçage (epoch ms). */
  readonly at: number;
  /** Motif du forçage. */
  readonly reason: string;
  /** Statut de l'étape au moment du forçage (contexte). */
  readonly forcedFromStatus: StepStatus;
}

/**
 * Événements pilotant la machine. Chacun porte son instant `at` (epoch ms) :
 * la machine ne lit jamais l'horloge, garantissant le déterminisme (ADR-08).
 */
export type DayEvent =
  /** Démarrer l'étape courante (`PENDING`). */
  | { readonly type: "START_STEP"; readonly at: number }
  /**
   * Confirmer la stabilisation à la température cible (saisie manuelle ou sonde) :
   * **seul** événement qui arme le timer de palier sanctuarisé.
   */
  | {
      readonly type: "CONFIRM_STABILIZATION";
      readonly at: number;
      readonly temperatureC?: number;
      readonly source?: MeasurementSource;
    }
  /** Saisir une mesure (densité/volume/température/pH). Ne change pas le statut. */
  | {
      readonly type: "RECORD_MEASUREMENT";
      readonly at: number;
      readonly kind: MeasurementKind;
      readonly value: number;
      readonly source?: MeasurementSource;
    }
  /** Valider l'étape courante (mode normal : conditions vérifiées). */
  | { readonly type: "VALIDATE_STEP"; readonly at: number }
  /**
   * Forcer l'étape (mode manuel) : avance malgré des conditions incomplètes et
   * produit une intention de `DeviationLog`.
   */
  | {
      readonly type: "FORCE_STEP";
      readonly at: number;
      readonly author: string;
      readonly reason: string;
    };

/** Résultat d'une transition — état suivant + effets à persister. */
export interface TransitionResult {
  readonly state: DayState;
  /** Intention de `DeviationLog` produite par « Forcer l'étape » (à persister). */
  readonly deviation?: DeviationLog;
  /** Motif de refus si l'événement n'est pas applicable (état renvoyé **inchangé**). */
  readonly rejection?: string;
}

/**
 * Photo du chronométrage d'une étape : **temps estimé vs réel** de montée en
 * chauffe (ramp) et de palier (hold), pour calibration et alertes d'écart.
 */
export interface StepTiming {
  readonly stepId: string;
  readonly phase: Phase;
  /** Montée en chauffe estimée (min) ou `null`. */
  readonly plannedRampMin: number | null;
  /** Montée en chauffe réelle (min) une fois stabilisé, sinon `null`. */
  readonly actualRampMin: number | null;
  /** Palier planifié (min) ou `null` (pas de timer). */
  readonly plannedHoldMin: number | null;
  /** Palier écoulé (min) depuis l'armement du timer, sinon `null`. */
  readonly elapsedHoldMin: number | null;
  /** Palier restant (min, ≥ 0) sinon `null`. */
  readonly holdRemainingMin: number | null;
  /** Dépassement du palier (min, ≥ 0). */
  readonly holdOverrunMin: number;
  /** Le palier planifié est-il écoulé ? (`false` si pas de timer). */
  readonly holdElapsed: boolean;
}

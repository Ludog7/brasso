/**
 * Arithmétique **calendaire** dans un fuseau IANA — support de FORMULES §13.1.
 *
 * Pourquoi ce module existe : ajouter « 21 jours » à une date n'est **pas**
 * ajouter `21 × 86 400 000 ms`. Si un changement d'heure survient dans
 * l'intervalle, l'addition en millisecondes décale l'heure locale d'une heure et
 * peut faire basculer la **date** d'un jour. Une garde de 21 jours doit rester
 * 21 jours calendaires, à la même heure locale.
 *
 * `core` étant sans dépendance de dates (ADR-03), le fuseau est résolu via
 * `Intl.DateTimeFormat`, présent dans le runtime — aucune table de fuseaux
 * embarquée, donc aucune donnée à maintenir.
 */

/** Champs de calendrier **locaux** d'un instant, dans un fuseau donné. */
interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

/**
 * Formatteurs mémorisés par fuseau : `Intl.DateTimeFormat` est coûteux à
 * construire et le calcul d'un cycle en instancierait un par jalon.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * @throws RangeError si le fuseau n'est pas un identifiant IANA connu du
 *   runtime — une faute de frappe dans `Settings.timezone` doit se voir, pas
 *   produire silencieusement des dates UTC.
 */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Champs numériques que le formatteur renseigne ; le reste est du séparateur. */
const CALENDAR_FIELDS = ["year", "month", "day", "hour", "minute", "second"] as const;
type CalendarField = (typeof CALENDAR_FIELDS)[number];

const isCalendarField = (type: string): type is CalendarField =>
  (CALENDAR_FIELDS as readonly string[]).includes(type);

/** Décompose un instant en champs de calendrier locaux du fuseau. */
function partsInZone(epochMs: number, timeZone: string): ZonedParts {
  const fields: Record<CalendarField, number> = {
    year: 0,
    month: 0,
    day: 0,
    // `hourCycle: "h23"` garantit 0-23 ; sans lui, minuit se formaterait « 24 ».
    hour: 0,
    minute: 0,
    second: 0,
  };
  // `formatToParts` intercale des `literal` (« / », « : », espaces) entre les
  // champs : on ne retient que ceux du calendrier.
  for (const { type, value } of formatterFor(timeZone).formatToParts(new Date(epochMs))) {
    if (isCalendarField(type)) fields[type] = Number(value);
  }
  return {
    ...fields,
    // Les millisecondes ne sont pas formatables : elles ne dépendent d'aucun
    // fuseau (aucun décalage n'est sub-seconde), on les reprend de l'instant.
    // Le double modulo ramène un instant négatif (avant 1970) dans [0, 1000[.
    millisecond: ((epochMs % 1000) + 1000) % 1000,
  };
}

/** Décalage du fuseau (ms) à un instant donné : `heure locale − UTC`. */
function offsetMsAt(epochMs: number, timeZone: string): number {
  const p = partsInZone(epochMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.millisecond);
  return asUtc - epochMs;
}

/**
 * Recompose l'instant correspondant à des champs de calendrier **locaux**.
 *
 * Le décalage à appliquer dépend de l'instant… qu'on cherche justement à
 * déterminer. On résout par deux passes : une première estimation avec le
 * décalage en vigueur à l'instant « comme si c'était UTC », puis une correction
 * avec le décalage réellement en vigueur à cette estimation. Deux passes
 * suffisent, les décalages ne variant que de quelques heures.
 *
 * Heures locales ambiguës (reculer l'heure) ou inexistantes (avancer l'heure) :
 * on renvoie un instant voisin cohérent plutôt que d'échouer — le cycle d'un
 * brassin ne se joue pas à l'heure près, et lever une exception ici bloquerait
 * un ensemencement pour un cas sans portée métier.
 */
function epochFromZonedParts(parts: ZonedParts, timeZone: string): number {
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  const firstGuess = asUtc - offsetMsAt(asUtc, timeZone);
  return asUtc - offsetMsAt(firstGuess, timeZone);
}

/**
 * Ajoute `days` jours **calendaires** à un instant, dans le fuseau donné :
 * l'heure locale est préservée à travers un éventuel changement d'heure.
 *
 * `Date.UTC` normalise les débordements (le 32 mars devient le 1ᵉʳ avril), donc
 * aucune gestion de longueur de mois ni d'année bissextile n'est nécessaire.
 */
export function addCalendarDays(epochMs: number, days: number, timeZone: string): number {
  const p = partsInZone(epochMs, timeZone);
  return epochFromZonedParts({ ...p, day: p.day + days }, timeZone);
}

/**
 * Date calendaire locale d'un instant, au format ISO `YYYY-MM-DD`.
 *
 * C'est la forme sous laquelle le métier raisonne (« fin de garde le
 * 2026-04-10 ») et celle des valeurs de référence de FORMULES §13.1 ; l'instant,
 * lui, sert la persistance. Exposer les deux évite que chaque consommateur
 * refasse la conversion — et se trompe de fuseau en la refaisant.
 */
export function calendarDateInZone(epochMs: number, timeZone: string): string {
  const p = partsInZone(epochMs, timeZone);
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

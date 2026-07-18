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
 * déterminer. On calcule donc deux candidats — l'un avec le décalage en vigueur
 * « comme si les champs étaient UTC », l'autre avec celui en vigueur à cette
 * première estimation. Hors changement d'heure, les deux coïncident.
 *
 * Quand ils diffèrent, un changement d'heure sépare les deux candidats. On
 * tranche en **relisant** le candidat le plus tôt : s'il redonne exactement les
 * champs demandés, c'est le bon — il ne faut pas avancer.
 *
 * Ne pas court-circuiter ce contrôle en prenant systématiquement l'un des deux :
 * - toujours le plus tôt ⇒ faux dans un **trou** (heure locale sautée au passage
 *   à l'heure d'été). Sur un fuseau dont la transition tombe à **minuit**
 *   — Santiago, La Havane, Asuncion — reculer traverse la frontière de date et
 *   date le jalon de la veille (#255) ;
 * - toujours le plus tard ⇒ faux quand l'heure demandée est parfaitement valide
 *   mais que la sonde initiale, elle, tombe de l'autre côté d'une transition
 *   proche (observé à Sydney et Lord Howe). Le jalon gagne alors un jour.
 *
 * C'est la date qui porte tout le sens d'un jalon ; l'heure exacte à laquelle
 * démarre une garde de trois semaines n'a, elle, aucune portée métier.
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
  const offsetBefore = offsetMsAt(asUtc, timeZone);
  const offsetAfter = offsetMsAt(asUtc - offsetBefore, timeZone);
  if (offsetBefore === offsetAfter) return asUtc - offsetBefore;

  const earlier = Math.min(asUtc - offsetBefore, asUtc - offsetAfter);
  const later = Math.max(asUtc - offsetBefore, asUtc - offsetAfter);
  // `earlier` se relit-il sur les champs demandés ? Si oui il les représente
  // fidèlement ; sinon l'heure locale n'existe pas et `later` tombe juste après
  // le saut, donc à la bonne date.
  return earlier + offsetMsAt(earlier, timeZone) === asUtc ? earlier : later;
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

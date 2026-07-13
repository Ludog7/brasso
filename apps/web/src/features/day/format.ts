/**
 * Formatage des durées du dérouleur Jour J (M4-10). Unités internes en **minutes**
 * (CLAUDE.md) ; l'affichage humanise en `m:ss` pour le compte à rebours et en
 * minutes arrondies pour les temps de montée en chauffe.
 */

/** Durée (min) → `m:ss` (secondes bornées à ≥ 0). Ex. `1.5` → `"1:30"`. */
export function formatMinSec(minutes: number): string {
  const totalSec = Math.max(0, Math.round(minutes * 60));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Durée (min) arrondie au dixième, ou `—` si inconnue. Ex. `14.97` → `"15 min"`. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  return `${Math.round(minutes * 10) / 10} min`;
}

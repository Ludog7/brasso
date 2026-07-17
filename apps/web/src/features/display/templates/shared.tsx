/**
 * Éléments de présentation partagés par les trois templates de rendu (M7-13) :
 * formatage du prix (centimes internes → euros) et badges d'indicateurs
 * (« nouveau »/« coup de cœur »/« brassin spécial »). Ordre stable via `ITEM_FLAGS`.
 */

import type { DisplayItemFlags } from "@/lib/api";
import { Badge, type BadgeProps } from "@/ui/badge";

import { ITEM_FLAGS, type ItemFlagKey } from "../labels";

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** Prix affiché en euros (centimes internes → €). `null` → tiret (prix non renseigné). */
export function formatDisplayPrice(priceCents: number | null): string {
  return priceCents == null ? "—" : eurFmt.format(priceCents / 100);
}

/** Teinte de badge par indicateur — lisible à distance, fort contraste (atelier). */
const FLAG_TONE: Record<ItemFlagKey, NonNullable<BadgeProps["tone"]>> = {
  isNew: "accent",
  isFavorite: "warning",
  isSpecial: "success",
};

/** Badges des indicateurs **actifs** d'un produit (rien si aucun). */
export function DisplayItemBadges({ flags }: { flags: DisplayItemFlags }) {
  const active = ITEM_FLAGS.filter((flag) => flags[flag.key]);
  if (active.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {active.map((flag) => (
        <Badge key={flag.key} tone={FLAG_TONE[flag.key]} className="text-sm sm:text-base">
          {flag.label}
        </Badge>
      ))}
    </span>
  );
}

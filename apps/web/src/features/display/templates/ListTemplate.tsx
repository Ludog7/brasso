/**
 * Template « Liste » (M7-13) : une ligne par produit (nom + indicateurs à gauche, prix
 * à droite), gros texte et fort contraste. Mémoïsé : une référence `items` stable
 * (jeton de sync inchangé) n'entraîne aucun re-render.
 */

import { memo } from "react";

import type { DisplayRenderItem } from "@/lib/api";

import { DisplayItemBadges, formatDisplayPrice } from "./shared";

export const ListTemplate = memo(function ListTemplate({ items }: { items: DisplayRenderItem[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => (
        <li
          key={item.catalogItemId}
          className="flex flex-wrap items-center justify-between gap-4 py-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-3xl font-bold leading-tight text-foreground">{item.name}</span>
            <DisplayItemBadges flags={item.flags} />
          </div>
          <span className="text-3xl font-extrabold tabular-nums text-primary">
            {formatDisplayPrice(item.priceCents)}
          </span>
        </li>
      ))}
    </ul>
  );
});

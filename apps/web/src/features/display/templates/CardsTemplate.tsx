/**
 * Template « Cartes » (M7-13) : une grille de cartes produit, gros texte et fort
 * contraste pour une lecture à distance (bar/vitrine). Mémoïsé : une référence
 * `items` stable (jeton de sync inchangé) n'entraîne aucun re-render.
 */

import { memo } from "react";

import type { DisplayRenderItem } from "@/lib/api";
import { Card, CardContent } from "@/ui/card";

import { DisplayItemBadges, formatDisplayPrice } from "./shared";

export const CardsTemplate = memo(function CardsTemplate({
  items,
}: {
  items: DisplayRenderItem[];
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.catalogItemId}>
          <Card className="h-full">
            <CardContent className="flex h-full flex-col justify-between gap-4 py-6">
              <div className="flex flex-col gap-3">
                <h2 className="text-3xl font-bold leading-tight text-foreground">{item.name}</h2>
                <DisplayItemBadges flags={item.flags} />
              </div>
              <p className="text-4xl font-extrabold tabular-nums text-primary">
                {formatDisplayPrice(item.priceCents)}
              </p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
});

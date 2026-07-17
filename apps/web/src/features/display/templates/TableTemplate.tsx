/**
 * Template « Tableau » (M7-13) : deux colonnes (Produit, Prix), gros texte et fort
 * contraste. Les indicateurs sont rendus sous le nom. Mémoïsé : une référence `items`
 * stable (jeton de sync inchangé) n'entraîne aucun re-render.
 */

import { memo } from "react";

import type { DisplayRenderItem } from "@/lib/api";

import { DisplayItemBadges, formatDisplayPrice } from "./shared";

export const TableTemplate = memo(function TableTemplate({
  items,
}: {
  items: DisplayRenderItem[];
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-border text-left text-lg uppercase tracking-wide text-muted-foreground">
          <th scope="col" className="py-3 pr-4 font-semibold">
            Produit
          </th>
          <th scope="col" className="py-3 pl-4 text-right font-semibold">
            Prix
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.catalogItemId} className="border-b border-border">
            <td className="py-5 pr-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-3xl font-bold leading-tight text-foreground">
                  {item.name}
                </span>
                <DisplayItemBadges flags={item.flags} />
              </div>
            </td>
            <td className="py-5 pl-4 text-right align-middle text-3xl font-extrabold tabular-nums text-primary">
              {formatDisplayPrice(item.priceCents)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});

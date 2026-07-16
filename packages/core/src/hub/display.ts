/**
 * Rendu **pur** d'un écran d'affichage (§Module d'affichage, sélection & sync).
 *
 * `selectDisplayItems` filtre les produits **disponibles** (stock > 0), applique les
 * indicateurs (« nouveau »/« coup de cœur »/« brassin spécial »), trie par `sortOrder`
 * et projette la liste pour le template. Aucun effet de bord, `now` injecté : la
 * fonction est **ré-exécutable** à chaque changement de stock (base de la sync M7-13).
 * ADR-03 (core pur).
 */

/** Produit d'un écran + ses indicateurs (projection API de `DisplayScreenItem`). */
export interface DisplayItemInput {
  catalogItemId: string;
  /** Libellé affiché (résolu depuis `CatalogItem` par l'appelant). */
  name: string;
  isNew?: boolean;
  isFavorite?: boolean;
  isSpecial?: boolean;
  /**
   * Optionnel : borne d'expiration du badge « nouveau ». Si fournie, `isNew` n'est
   * retenu que tant que `now ≤ newUntil` (badge « nouveau » qui s'éteint tout seul).
   * Absent → le booléen `isNew` fait foi.
   */
  newUntil?: Date | null;
  priceCents?: number | null;
  sortOrder?: number;
}

/** Indicateurs résolus d'un produit affiché. */
export interface DisplayItemFlags {
  isNew: boolean;
  isFavorite: boolean;
  isSpecial: boolean;
}

/** Produit **projeté** pour le template (disponible, trié, flags résolus). */
export interface RenderedDisplayItem {
  catalogItemId: string;
  name: string;
  priceCents: number | null;
  flags: DisplayItemFlags;
  sortOrder: number;
}

/**
 * Sélectionne et projette les produits affichables d'un écran :
 * 1. **filtre** les indisponibles (`stock ≤ 0`, ou stock inconnu → 0) ;
 * 2. **résout** les flags (`isNew` s'éteint après `newUntil` si fourni) ;
 * 3. **trie** par `sortOrder` croissant (tri stable, ordre d'entrée préservé à égalité).
 *
 * Pur : aucune mutation des entrées, aucune horloge implicite (`now` injecté).
 */
export function selectDisplayItems(
  items: readonly DisplayItemInput[],
  stockByCatalogItemId: Readonly<Record<string, number>>,
  now: Date,
): RenderedDisplayItem[] {
  const nowMs = now.getTime();

  return items
    .filter((item) => (stockByCatalogItemId[item.catalogItemId] ?? 0) > 0)
    .map((item) => {
      const isNew =
        item.isNew === true && (item.newUntil == null || nowMs <= item.newUntil.getTime());
      return {
        catalogItemId: item.catalogItemId,
        name: item.name,
        priceCents: item.priceCents ?? null,
        flags: {
          isNew,
          isFavorite: item.isFavorite === true,
          isSpecial: item.isSpecial === true,
        },
        sortOrder: item.sortOrder ?? 0,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Libellés FR de la configuration d'affichage (M7-12) : templates de rendu et
 * indicateurs produits (« nouveau »/« coup de cœur »/« brassin spécial »). Ordres
 * d'itération stables pour un rendu déterministe.
 */

import type { DisplayTemplate } from "@/lib/api";

export const DISPLAY_TEMPLATES: DisplayTemplate[] = ["LIST", "TABLE", "CARDS"];

export const TEMPLATE_LABELS: Record<DisplayTemplate, string> = {
  LIST: "Liste",
  TABLE: "Tableau",
  CARDS: "Cartes",
};

/** Indicateurs d'un produit affiché (clé du flag → libellé court). */
export const ITEM_FLAGS = [
  { key: "isNew", label: "Nouveau" },
  { key: "isFavorite", label: "Coup de cœur" },
  { key: "isSpecial", label: "Brassin spécial" },
] as const;

export type ItemFlagKey = (typeof ITEM_FLAGS)[number]["key"];

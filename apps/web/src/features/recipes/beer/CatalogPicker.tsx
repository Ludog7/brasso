import type { IngredientCategory } from "@brasso/core";

import type { CatalogItem } from "@/lib/api";
import { Select } from "@/ui/select";

import { useCatalogItems } from "../hooks";

interface CatalogPickerProps {
  category: IngredientCategory;
  onPick: (item: CatalogItem) => void;
  disabled?: boolean;
}

/**
 * Sélecteur « depuis le catalogue » (M2-04) : liste les articles de la catégorie
 * et remonte l'article choisi au parent (qui préremplit la ligne). Contrôlé sur
 * la valeur vide → se réinitialise après chaque choix.
 */
export function CatalogPicker({ category, onPick, disabled }: CatalogPickerProps) {
  const items = useCatalogItems(category);
  return (
    <Select
      aria-label="Ajouter depuis le catalogue"
      className="max-w-64"
      value=""
      disabled={disabled || items.isPending}
      onChange={(e) => {
        const picked = items.data?.find((item) => item.id === e.target.value);
        if (picked) onPick(picked);
      }}
    >
      <option value="">＋ Depuis le catalogue…</option>
      {items.data?.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </Select>
  );
}

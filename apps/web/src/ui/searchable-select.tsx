import { Search } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

/**
 * Sélecteur avec **recherche** — primitive partagée (M9-13 §C).
 *
 * Le brief (§3.J) signale qu'un article est difficile à retrouver à l'ajout : une
 * liste déroulante longue oblige à parcourir des dizaines d'entrées au doigt. Un
 * champ de recherche **filtre** les options offertes, sans changer la nature du
 * contrôle.
 *
 * Choix assumé : un `<input type="search">` **plus** un `<select>` natif, et non
 * une combobox maison. Le select natif ouvre le sélecteur système de la
 * tablette — meilleur au doigt que n'importe quelle liste HTML — et reste
 * accessible au clavier et aux lecteurs d'écran sans qu'on ait à réimplémenter
 * `aria-activedescendant`. Le traitement général de la recherche de stock relève
 * de M11 ; cette primitive est faite pour qu'il n'y ait pas alors deux
 * sélecteurs concurrents à réconcilier.
 */
export interface SearchableOption {
  value: string;
  label: string;
  /** Complément affiché après le libellé (stock disponible, contenance…). */
  hint?: string;
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Rechercher…",
  emptyLabel = "Aucun résultat",
  className,
}: {
  label: string;
  value: string;
  options: readonly SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const searchId = useId();
  const selectId = useId();

  const needle = search.trim().toLowerCase();
  const filtered =
    needle === ""
      ? options
      : options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(needle));

  // L'option sélectionnée reste offerte même quand la recherche l'exclut :
  // sinon, taper dans le champ ferait silencieusement perdre le choix courant.
  const selected = options.find((o) => o.value === value);
  const shown =
    selected && !filtered.some((o) => o.value === selected.value)
      ? [selected, ...filtered]
      : filtered;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={selectId}>{label}</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={searchId}
          type="search"
          className="pl-9"
          value={search}
          placeholder={placeholder}
          aria-label={`Rechercher — ${label}`}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Select id={selectId} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{shown.length === 0 ? emptyLabel : "— Choisir —"}</option>
        {shown.map((option) => (
          <option key={option.value} value={option.value}>
            {option.hint ? `${option.label} · ${option.hint}` : option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

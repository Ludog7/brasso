/**
 * Création / édition d'un mapping SKU↔produit externe (M7-09). Sélection de
 * l'article de catalogue lié (optionnel : un mapping incomplet est toléré, il ne
 * décrémentera pas le stock tant qu'il n'est pas complété). Le conflit d'unicité
 * `(providerId, externalProductId)` / `internalSku` (**409**) est traduit en message
 * clair. Validation minimale alignée sur le schéma core (champs requis non vides).
 */

import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { ApiError, type MappingCreateInput, type SkuMapping } from "@/lib/api";
import { Button } from "@/ui/button";
import { DialogShell } from "@/ui/dialog-shell";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

import { useCatalogItems, useCreateMapping, useUpdateMapping } from "./hooks";

/** Message d'erreur lisible : conflit d'unicité (409) explicité, reste générique. */
function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "MAPPING_CONFLICT") {
    return "Un mapping est déjà défini pour ce produit externe ou ce SKU interne.";
  }
  return "Enregistrement impossible. Réessayez.";
}

export function MappingFormDialog({
  mapping,
  onClose,
}: {
  mapping?: SkuMapping;
  onClose: () => void;
}) {
  const editing = mapping !== undefined;
  const create = useCreateMapping();
  const update = useUpdateMapping(mapping?.id ?? "");
  const mutation = editing ? update : create;
  const catalogItems = useCatalogItems();

  const [internalSku, setInternalSku] = useState(mapping?.internalSku ?? "");
  const [providerId, setProviderId] = useState(mapping?.providerId ?? "");
  const [externalProductId, setExternalProductId] = useState(mapping?.externalProductId ?? "");
  const [externalCategory, setExternalCategory] = useState(mapping?.externalCategory ?? "");
  const [catalogItemId, setCatalogItemId] = useState(mapping?.catalogItemId ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (internalSku.trim() === "" || providerId.trim() === "" || externalProductId.trim() === "") {
      setError("SKU interne, fournisseur et produit externe sont obligatoires.");
      return;
    }
    setError(null);

    const input: MappingCreateInput = {
      internalSku: internalSku.trim(),
      providerId: providerId.trim(),
      externalProductId: externalProductId.trim(),
      // `null` détache explicitement l'article (édition) ; champ requis pour un remplacement propre.
      catalogItemId: catalogItemId === "" ? null : catalogItemId,
      ...(externalCategory.trim() ? { externalCategory: externalCategory.trim() } : {}),
    };

    mutation.mutate(input, { onSuccess: onClose });
  };

  return (
    <DialogShell
      title={editing ? "Modifier le mapping" : "Nouveau mapping"}
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mapping-sku">SKU interne</Label>
          <Input
            id="mapping-sku"
            value={internalSku}
            onChange={(e) => setInternalSku(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-provider">Fournisseur</Label>
            <Input
              id="mapping-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              placeholder="p-sumup"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-external">Produit externe</Label>
            <Input
              id="mapping-external"
              value={externalProductId}
              onChange={(e) => setExternalProductId(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mapping-category">Catégorie externe</Label>
          <Input
            id="mapping-category"
            value={externalCategory}
            onChange={(e) => setExternalCategory(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Optionnelle.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mapping-catalog">Article de catalogue lié</Label>
          <Select
            id="mapping-catalog"
            value={catalogItemId}
            onChange={(e) => setCatalogItemId(e.target.value)}
          >
            <option value="">Aucun (mapping incomplet)</option>
            {(catalogItems.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Sans article lié, la vente est enregistrée mais ne décrémente pas le stock.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {errorMessage(mutation.error)}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            {editing ? "Enregistrer" : "Créer le mapping"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

/**
 * Tableau des correspondances SKU↔produit externe (M7-09) : SKU interne, produit
 * externe (provider + référence), catégorie, article de catalogue lié. Les actions
 * d'écriture (éditer/supprimer) ne sont rendues que si `canManage` (RBAC UI, l'API
 * reste l'autorité). Un mapping sans article lié est signalé (rapprochement incomplet).
 */

import type { SkuMapping } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

export function MappingList({
  mappings,
  canManage,
  onEdit,
  onDelete,
  deletingId,
}: {
  mappings: SkuMapping[];
  canManage: boolean;
  onEdit: (mapping: SkuMapping) => void;
  onDelete: (mapping: SkuMapping) => void;
  /** Id du mapping dont la suppression est en cours (bouton désactivé). */
  deletingId?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">SKU interne</th>
            <th className="py-2 pr-4 font-medium">Produit externe</th>
            <th className="py-2 pr-4 font-medium">Catégorie</th>
            <th className="py-2 pr-4 font-medium">Article catalogue</th>
            {canManage ? <th className="py-2 font-medium sr-only">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {mappings.map((mapping) => (
            <tr key={mapping.id} className="border-t border-border align-middle">
              <td className="py-3 pr-4 font-medium tabular-nums text-foreground">
                {mapping.internalSku}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                <span className="text-foreground">{mapping.externalProductId}</span>
                <span className="block text-xs">{mapping.providerId}</span>
              </td>
              <td className="py-3 pr-4 text-muted-foreground">{mapping.externalCategory ?? "—"}</td>
              <td className="py-3 pr-4">
                {mapping.catalogItem ? (
                  mapping.catalogItem.name
                ) : (
                  <Badge tone="warning">Non lié</Badge>
                )}
              </td>
              {canManage ? (
                <td className="py-3">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onEdit(mapping)}>
                      Éditer
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onDelete(mapping)}
                      disabled={deletingId === mapping.id}
                    >
                      Supprimer
                    </Button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Écran Stock (M5-07) : catalogue + niveaux dérivés, alertes de seuil, saisie de
 * mouvements et inventaire. RBAC UI : les actions d'écriture (créer/modifier un
 * article, mouvement, inventaire) ne sont rendues qu'aux rôles CRUD stock
 * (`admin`/`brasseur`) ; un rôle lecture seule (`caisse`) ne voit que la consultation.
 * L'API reste l'autorité (deny-by-default) ; l'UI ne fait que masquer.
 */

import type { CatalogKind } from "@brasso/core";
import { AlertTriangle, ClipboardList, Loader2, LogOut, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useStockAlerts, useStockItems } from "@/features/stock/hooks";
import { InventoryPanel } from "@/features/stock/InventoryPanel";
import { ItemFormDialog } from "@/features/stock/ItemFormDialog";
import { KIND_LABELS } from "@/features/stock/labels";
import { MovementDialog } from "@/features/stock/MovementDialog";
import { StockList } from "@/features/stock/StockList";
import { StockToaster } from "@/features/stock/toast";
import { useLogout } from "@/hooks/useAuth";
import type { StockItem } from "@/lib/api";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

type KindFilter = CatalogKind | "ALL";
/**
 * `PRODUIT_FINI` figure dans les filtres depuis M9-13 : le conditionnement d'un
 * brassin crée un article de cette famille, et c'est là qu'on vient constater
 * qu'une bière est bien entrée en stock, prête à être vendue.
 */
const KIND_FILTERS: KindFilter[] = ["ALL", "RECETTE", "BULK", "CONDITIONNEMENT", "PRODUIT_FINI"];

type Dialog = { mode: "create" } | { mode: "edit"; item: StockItem } | { mode: "movement" } | null;

/** Droits d'écriture stock (matrice §3.5) : admin/brasseur CRUD, caisse lecture. */
function canWriteStock(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("brasseur");
}

export function StockPage() {
  const user = useSession((s) => s.user);
  const logout = useLogout();
  const [filter, setFilter] = useState<KindFilter>("ALL");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showInventory, setShowInventory] = useState(false);

  const kind = filter === "ALL" ? undefined : filter;
  const items = useStockItems(kind);
  const alerts = useStockAlerts();
  const canWrite = canWriteStock(user?.roles ?? []);
  const itemList = items.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link to="/" className="text-lg font-semibold">
          Brasso
        </Link>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-5" aria-hidden="true" />
          )}
          Déconnexion
        </Button>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setDialog({ mode: "create" })}>
                <Plus className="size-5" aria-hidden="true" />
                Nouvel article
              </Button>
              <Button
                variant="outline"
                onClick={() => setDialog({ mode: "movement" })}
                disabled={itemList.length === 0}
              >
                Mouvement
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowInventory((v) => !v)}
                disabled={itemList.length === 0}
              >
                <ClipboardList className="size-5" aria-hidden="true" />
                Inventaire
              </Button>
            </div>
          ) : null}
        </div>

        {alerts.data && alerts.data.length > 0 ? (
          <Card className="mt-6 border-warning/40">
            <CardContent className="flex flex-col gap-2 py-4">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="size-5" aria-hidden="true" />
                <span className="font-medium">
                  {alerts.data.length} article(s) sous le seuil de réappro
                </span>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {alerts.data.map((a) => (
                  <li key={a.id}>
                    {a.name} — dispo {a.available} / seuil {a.reorderThreshold}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <Label htmlFor="filter-kind">Filtre par type</Label>
          <Select
            id="filter-kind"
            value={filter}
            onChange={(e) => setFilter(e.target.value as KindFilter)}
            className="min-w-52"
          >
            {KIND_FILTERS.map((k) => (
              <option key={k} value={k}>
                {k === "ALL" ? "Tous" : KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>

        {canWrite && showInventory && itemList.length > 0 ? (
          <div className="mt-6">
            <InventoryPanel items={itemList} onClose={() => setShowInventory(false)} />
          </div>
        ) : null}

        <div className="mt-6">
          {items.isPending ? (
            <div className="flex items-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              <span>Chargement du stock…</span>
            </div>
          ) : items.isError ? (
            <div className="flex flex-col items-start gap-3 py-12">
              <p role="alert" className="text-destructive-foreground">
                Impossible de charger le stock.
              </p>
              <Button variant="outline" onClick={() => void items.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : itemList.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Aucun article pour ce filtre.
              </CardContent>
            </Card>
          ) : (
            <StockList
              items={itemList}
              canWrite={canWrite}
              onEdit={(item) => setDialog({ mode: "edit", item })}
            />
          )}
        </div>
      </main>

      {dialog?.mode === "create" ? <ItemFormDialog onClose={() => setDialog(null)} /> : null}
      {dialog?.mode === "edit" ? (
        <ItemFormDialog item={dialog.item} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.mode === "movement" ? (
        <MovementDialog items={itemList} onClose={() => setDialog(null)} />
      ) : null}

      <StockToaster />
    </div>
  );
}

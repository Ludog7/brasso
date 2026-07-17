/**
 * Espace caisse (M7-09) : gestion des mappings SKU↔produit externe et consultation
 * des transactions externes (ventes/cotisations) avec leur statut de rapprochement.
 * RBAC UI : l'écran est réservé aux rôles habilités (`transactions:read` — masqué à
 * `rgpd`) ; les actions d'écriture du mapping sont réservées à `admin`/`caisse`
 * (`canManageMapping`). L'API reste l'autorité (deny-by-default).
 */

import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { useDeleteMapping, useMappings, useTransactions } from "@/features/cash/hooks";
import { TRANSACTION_KIND_LABELS, TRANSACTION_KINDS } from "@/features/cash/labels";
import { MappingFormDialog } from "@/features/cash/MappingFormDialog";
import { MappingList } from "@/features/cash/MappingList";
import { TransactionList } from "@/features/cash/TransactionList";
import type { ExternalTransactionKind, ExternalTransactionStatus, SkuMapping } from "@/lib/api";
import { canAccessCash, canManageMapping } from "@/lib/rbac";
import { AppShell } from "@/routes/AppShell";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

type StatusFilter = ExternalTransactionStatus | "ALL";
type KindFilter = ExternalTransactionKind | "ALL";
type Dialog = { mode: "create" } | { mode: "edit"; mapping: SkuMapping } | null;

export function CashPage() {
  const user = useSession((s) => s.user);
  const roles = user?.roles ?? [];
  const canAccess = canAccessCash(roles);
  const canManage = canManageMapping(roles);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [kind, setKind] = useState<KindFilter>("ALL");

  const mappings = useMappings({}, canAccess);
  const transactions = useTransactions(
    {
      status: status === "ALL" ? undefined : status,
      kind: kind === "ALL" ? undefined : kind,
    },
    canAccess,
  );
  const deleteMapping = useDeleteMapping();

  if (!canAccess) {
    return (
      <AppShell>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p role="alert">
              Accès réservé aux rôles habilités (caisse, brasseur, administration).
            </p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const mappingList = mappings.data ?? [];
  const transactionList = transactions.data ?? [];

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Caisse</h1>

      {/* ── Mappings SKU ─────────────────────────────────────────────────── */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Mappings SKU</h2>
          {canManage ? (
            <Button onClick={() => setDialog({ mode: "create" })}>
              <Plus className="size-5" aria-hidden="true" />
              Nouveau mapping
            </Button>
          ) : null}
        </div>

        <div className="mt-4">
          {mappings.isPending ? (
            <div className="flex items-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              <span>Chargement des mappings…</span>
            </div>
          ) : mappings.isError ? (
            <div className="flex flex-col items-start gap-3 py-10">
              <p role="alert" className="text-destructive-foreground">
                Impossible de charger les mappings.
              </p>
              <Button variant="outline" onClick={() => void mappings.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : mappingList.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Aucun mapping défini.
              </CardContent>
            </Card>
          ) : (
            <MappingList
              mappings={mappingList}
              canManage={canManage}
              onEdit={(mapping) => setDialog({ mode: "edit", mapping })}
              onDelete={(mapping) => deleteMapping.mutate(mapping.id)}
              deletingId={deleteMapping.isPending ? deleteMapping.variables : undefined}
            />
          )}
        </div>
      </section>

      {/* ── Transactions externes ────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Transactions externes</h2>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-status">Statut</Label>
            <Select
              id="tx-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="min-w-44"
            >
              <option value="ALL">Tous</option>
              <option value="MAPPED">Rapprochée</option>
              <option value="UNMAPPED">À rapprocher</option>
              <option value="IGNORED">Ignorée</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-kind">Nature</Label>
            <Select
              id="tx-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as KindFilter)}
              className="min-w-44"
            >
              <option value="ALL">Toutes</option>
              {TRANSACTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {TRANSACTION_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-4">
          {transactions.isPending ? (
            <div className="flex items-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              <span>Chargement des transactions…</span>
            </div>
          ) : transactions.isError ? (
            <div className="flex flex-col items-start gap-3 py-10">
              <p role="alert" className="text-destructive-foreground">
                Impossible de charger les transactions.
              </p>
              <Button variant="outline" onClick={() => void transactions.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : transactionList.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Aucune transaction pour ces critères.
              </CardContent>
            </Card>
          ) : (
            <TransactionList transactions={transactionList} />
          )}
        </div>
      </section>

      {dialog?.mode === "create" ? <MappingFormDialog onClose={() => setDialog(null)} /> : null}
      {dialog?.mode === "edit" ? (
        <MappingFormDialog mapping={dialog.mapping} onClose={() => setDialog(null)} />
      ) : null}
    </AppShell>
  );
}

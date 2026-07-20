/**
 * Écran Cotisations à rapprocher (M6-10) — boucle la démo M6 : assigner une
 * cotisation HelloAsso `UNMAPPED` à un membre le fait passer **A_JOUR**. RBAC UI :
 * la liste exige `transactions:read` (admin/brasseur/caisse) ; le rapprochement
 * exige `membres:update` (admin/rgpd) — seul `admin` cumule les deux, le bouton est
 * masqué sinon. L'API reste l'autorité.
 */

import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";

import { usePendingContributions, useReconcile } from "@/features/contributions/hooks";
import { ReconcileDialog } from "@/features/contributions/ReconcileDialog";
import { ReconcileList } from "@/features/contributions/ReconcileList";
import type { Contribution } from "@/lib/api";
import { canListContributions, canReconcile } from "@/lib/rbac";
import { AppShell } from "@/routes/AppShell";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";

export function ContributionsPage() {
  const roles = useSession((s) => s.user?.roles ?? []);
  const canList = canListContributions(roles);
  const canRec = canReconcile(roles);
  const [selected, setSelected] = useState<Contribution | null>(null);
  const [reconciledMsg, setReconciledMsg] = useState<string | null>(null);

  const contributions = usePendingContributions(canList);
  const reconcile = useReconcile();
  const list = contributions.data ?? [];

  if (!canList) {
    return (
      <AppShell>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p role="alert">Accès réservé aux rôles habilités.</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const doReconcile = (memberId: string): void => {
    if (!selected) return;
    reconcile.mutate(
      { id: selected.id, memberId },
      {
        onSuccess: () => {
          setReconciledMsg("Cotisation rapprochée — le membre est désormais à jour.");
          setSelected(null);
        },
      },
    );
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Cotisations à rapprocher</h1>

      {reconciledMsg ? (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          <span>{reconciledMsg}</span>
        </div>
      ) : null}

      <div className="mt-6">
        {contributions.isPending ? (
          <div className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            <span>Chargement des cotisations…</span>
          </div>
        ) : contributions.isError ? (
          <div className="flex flex-col items-start gap-3 py-12">
            <p role="alert" className="text-destructive-foreground">
              Impossible de charger les cotisations.
            </p>
            <Button variant="outline" onClick={() => void contributions.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Aucune cotisation à rapprocher.
            </CardContent>
          </Card>
        ) : (
          <ReconcileList
            contributions={list}
            canReconcile={canRec}
            onReconcile={(contribution) => {
              setReconciledMsg(null);
              setSelected(contribution);
            }}
          />
        )}
      </div>

      {selected ? (
        <ReconcileDialog
          contribution={selected}
          reconciling={reconcile.isPending}
          onReconcile={doReconcile}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </AppShell>
  );
}

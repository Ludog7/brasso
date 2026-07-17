/**
 * Dashboard des anomalies d'intégration (M7-10) — mode dégradé : ventes non
 * rapprochées & webhooks en échec, traités manuellement. RBAC UI : l'écran est
 * réservé aux rôles habilités (`transactions:read` — masqué à `rgpd`) ; l'action
 * « résoudre » est réservée à `admin`/`caisse` (`canResolveAlerts`). L'API reste
 * l'autorité. Par défaut la vue liste les anomalies **ouvertes** (à traiter).
 */

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { AlertList } from "@/features/alerts/AlertList";
import { AlertResolveDialog } from "@/features/alerts/AlertResolveDialog";
import { useAlerts } from "@/features/alerts/hooks";
import { ALERT_TYPE_LABELS } from "@/features/alerts/labels";
import type { IntegrationAlert, IntegrationAlertStatus, IntegrationAlertType } from "@/lib/api";
import { canResolveAlerts, canViewAlerts } from "@/lib/rbac";
import { AppShell } from "@/routes/AppShell";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

type StatusFilter = IntegrationAlertStatus | "ALL";
type TypeFilter = IntegrationAlertType | "ALL";

export function AlertsPage() {
  const roles = useSession((s) => s.user?.roles ?? []);
  const canView = canViewAlerts(roles);
  const canResolve = canResolveAlerts(roles);

  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [type, setType] = useState<TypeFilter>("ALL");
  const [resolving, setResolving] = useState<IntegrationAlert | null>(null);

  const alerts = useAlerts(
    {
      status: status === "ALL" ? undefined : status,
      type: type === "ALL" ? undefined : type,
    },
    canView,
  );

  if (!canView) {
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

  const list = alerts.data ?? [];

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Anomalies d'intégration</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ventes non rapprochées et webhooks en échec — traitement manuel du mode dégradé.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alert-status">Statut</Label>
          <Select
            id="alert-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="min-w-44"
          >
            <option value="ALL">Toutes</option>
            <option value="OPEN">Ouvertes</option>
            <option value="RESOLVED">Résolues</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alert-type">Type</Label>
          <Select
            id="alert-type"
            value={type}
            onChange={(e) => setType(e.target.value as TypeFilter)}
            className="min-w-56"
          >
            <option value="ALL">Tous</option>
            <option value="UNMAPPED_TRANSACTION">{ALERT_TYPE_LABELS.UNMAPPED_TRANSACTION}</option>
            <option value="WEBHOOK_FAILURE">{ALERT_TYPE_LABELS.WEBHOOK_FAILURE}</option>
          </Select>
        </div>
      </div>

      <div className="mt-6">
        {alerts.isPending ? (
          <div className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            <span>Chargement des anomalies…</span>
          </div>
        ) : alerts.isError ? (
          <div className="flex flex-col items-start gap-3 py-12">
            <p role="alert" className="text-destructive-foreground">
              Impossible de charger les anomalies.
            </p>
            <Button variant="outline" onClick={() => void alerts.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Aucune anomalie pour ces critères.
            </CardContent>
          </Card>
        ) : (
          <AlertList alerts={list} canResolve={canResolve} onResolve={setResolving} />
        )}
      </div>

      {resolving ? (
        <AlertResolveDialog alert={resolving} onClose={() => setResolving(null)} />
      ) : null}
    </AppShell>
  );
}

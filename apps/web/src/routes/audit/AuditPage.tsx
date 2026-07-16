/**
 * Écran Journal d'audit (M6-10) : consultation de la piste d'audit (§3.4). RBAC UI :
 * réservé à `admin`/`rgpd` (ressource `auditLog`) ; les autres rôles voient un
 * message d'accès refusé (l'API renverrait 403). Lecture seule.
 */

import { AuditLogView } from "@/features/audit/AuditLogView";
import { canViewAudit } from "@/lib/rbac";
import { AppShell } from "@/routes/AppShell";
import { useSession } from "@/stores/session";
import { Card, CardContent } from "@/ui/card";

export function AuditPage() {
  const roles = useSession((s) => s.user?.roles ?? []);
  const canView = canViewAudit(roles);

  if (!canView) {
    return (
      <AppShell>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p role="alert">Accès réservé aux rôles habilités (administration, référent RGPD).</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Journal d'audit</h1>
      <div className="mt-6">
        <AuditLogView enabled={canView} />
      </div>
    </AppShell>
  );
}

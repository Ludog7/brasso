/**
 * Écran des exports CSV comptables (M7-11) : télécharger ventes / cotisations /
 * mouvements sur une période, pour la comptabilité associative. RBAC UI : réservé
 * aux rôles habilités (`transactions:read` — masqué à `rgpd`) ; l'API reste l'autorité.
 */

import { ExportsPanel } from "@/features/exports/ExportsPanel";
import { canExportAccounting } from "@/lib/rbac";
import { AppShell } from "@/routes/AppShell";
import { useSession } from "@/stores/session";
import { Card, CardContent } from "@/ui/card";

export function ExportsPage() {
  const roles = useSession((s) => s.user?.roles ?? []);

  if (!canExportAccounting(roles)) {
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

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Exports comptables</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Exportez les écritures au format CSV pour votre outil de comptabilité.
      </p>
      <div className="mt-6">
        <ExportsPanel />
      </div>
    </AppShell>
  );
}

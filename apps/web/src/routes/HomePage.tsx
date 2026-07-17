import {
  BookOpen,
  Coins,
  Loader2,
  LogOut,
  Package,
  ScanBarcode,
  ScrollText,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useOpenAlertsCount } from "@/features/alerts/hooks";
import { useLogout } from "@/hooks/useAuth";
import {
  canAccessCash,
  canListContributions,
  canManageMembers,
  canViewAlerts,
  canViewAudit,
} from "@/lib/rbac";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";

export function HomePage() {
  const user = useSession((s) => s.user);
  const logout = useLogout();
  // Compteur d'anomalies ouvertes (hook appelé avant tout retour anticipé — règles des hooks).
  const openAlerts = useOpenAlertsCount(user ? canViewAlerts(user.roles) : false);

  if (!user) {
    return null; // garde assurée par RequireAuth
  }

  const canMembers = canManageMembers(user.roles);
  const canAudit = canViewAudit(user.roles);
  const canContributions = canListContributions(user.roles);
  const canCash = canAccessCash(user.roles);
  const canAlerts = canViewAlerts(user.roles);
  const openAlertCount = openAlerts.data ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-lg font-semibold">Brasso</span>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-5" aria-hidden="true" />
          )}
          Déconnexion
        </Button>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="self-start">
            <Link to="/recipes">
              <BookOpen className="size-5" aria-hidden="true" />
              Recettes
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="self-start">
            <Link to="/equipment">
              <Wrench className="size-5" aria-hidden="true" />
              Équipement
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="self-start">
            <Link to="/stock">
              <Package className="size-5" aria-hidden="true" />
              Stock
            </Link>
          </Button>
          {canMembers ? (
            <Button asChild size="lg" variant="outline" className="self-start">
              <Link to="/members">
                <Users className="size-5" aria-hidden="true" />
                Membres
              </Link>
            </Button>
          ) : null}
          {canCash ? (
            <Button asChild size="lg" variant="outline" className="self-start">
              <Link to="/cash">
                <ScanBarcode className="size-5" aria-hidden="true" />
                Caisse
              </Link>
            </Button>
          ) : null}
          {canAlerts ? (
            <Button asChild size="lg" variant="outline" className="self-start">
              <Link to="/alerts">
                <TriangleAlert className="size-5" aria-hidden="true" />
                Anomalies
                {openAlertCount > 0 ? (
                  <span
                    className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-amber-500/20 px-2 py-0.5 text-sm font-semibold text-amber-300"
                    aria-label={`${openAlertCount} anomalie(s) ouverte(s)`}
                  >
                    {openAlertCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          ) : null}
          {canContributions ? (
            <Button asChild size="lg" variant="outline" className="self-start">
              <Link to="/contributions">
                <Coins className="size-5" aria-hidden="true" />
                Cotisations
              </Link>
            </Button>
          ) : null}
          {canAudit ? (
            <Button asChild size="lg" variant="outline" className="self-start">
              <Link to="/audit">
                <ScrollText className="size-5" aria-hidden="true" />
                Audit
              </Link>
            </Button>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bonjour {user.displayName}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">Rôles</span>
            <div className="flex flex-wrap gap-2">
              {user.roles.length > 0 ? (
                user.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-md bg-primary/15 px-3 py-1 text-sm font-medium text-foreground"
                  >
                    {role}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Aucun rôle attribué</span>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

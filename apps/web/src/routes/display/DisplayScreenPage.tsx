/**
 * Route **plein écran** de la vue d'affichage temps réel (M7-13) : `/display/screen/:id`.
 * Layout **sans navigation** (destinée à un écran dédié en salle) — pas d'`AppShell`. La
 * page reste sous authentification (`RequireAuth`) ; l'accès suit la matrice RBAC de
 * l'affichage (`canViewDisplay`, masqué à `rgpd`). L'API demeure l'autorité.
 */

import { useParams } from "react-router-dom";

import { DisplayRenderView } from "@/features/display/DisplayRenderView";
import { canViewDisplay } from "@/lib/rbac";
import { useSession } from "@/stores/session";

export function DisplayScreenPage() {
  const { id = "" } = useParams();
  const roles = useSession((s) => s.user?.roles ?? []);

  if (!canViewDisplay(roles)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background p-8 text-center text-muted-foreground">
        <p role="alert" className="text-2xl font-semibold text-foreground">
          Accès réservé
        </p>
        <p>Cet écran est réservé aux rôles habilités (administration, brasseur, caisse).</p>
      </div>
    );
  }

  return <DisplayRenderView screenId={id} />;
}

/**
 * Configuration du module d'affichage (M7-12) : surfaces, écrans (template + mentions
 * légales) et sélection de produits affichés. RBAC UI : écran réservé aux rôles
 * `affichage` (masqué à `rgpd`) ; `admin` = CRUD complet ; `brasseur`/`caisse` = RU
 * (édition d'écran/produits, pas de création/suppression). L'API reste l'autorité.
 */

import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { useSurfaces } from "@/features/display/hooks";
import { ScreenFormDialog } from "@/features/display/ScreenFormDialog";
import { ScreenItemsEditor } from "@/features/display/ScreenItemsEditor";
import { SurfaceFormDialog } from "@/features/display/SurfaceFormDialog";
import { SurfaceList } from "@/features/display/SurfaceList";
import type { DisplayScreen, DisplaySurface } from "@/lib/api";
import { canAdminDisplay, canViewDisplay } from "@/lib/rbac";
import { AppShell } from "@/routes/AppShell";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";

type Dialog =
  | { kind: "surface-new" }
  | { kind: "surface-edit"; surface: DisplaySurface }
  | { kind: "screen-new"; surfaceId: string }
  | { kind: "screen-edit"; surfaceId: string; screen: DisplayScreen }
  | { kind: "items"; screen: DisplayScreen }
  | null;

export function DisplayConfigPage() {
  const roles = useSession((s) => s.user?.roles ?? []);
  const canView = canViewDisplay(roles);
  const canAdmin = canAdminDisplay(roles);

  const [dialog, setDialog] = useState<Dialog>(null);
  const surfaces = useSurfaces(canView);

  if (!canView) {
    return (
      <AppShell>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p role="alert">
              Accès réservé aux rôles habilités (administration, brasseur, caisse).
            </p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const list = surfaces.data ?? [];

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Écrans d'affichage</h1>
        {canAdmin ? (
          <Button onClick={() => setDialog({ kind: "surface-new" })}>
            <Plus className="size-5" aria-hidden="true" />
            Nouvelle surface
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {surfaces.isPending ? (
          <div className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            <span>Chargement des surfaces…</span>
          </div>
        ) : surfaces.isError ? (
          <div className="flex flex-col items-start gap-3 py-12">
            <p role="alert" className="text-destructive-foreground">
              Impossible de charger les surfaces.
            </p>
            <Button variant="outline" onClick={() => void surfaces.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Aucune surface d'affichage configurée.
            </CardContent>
          </Card>
        ) : (
          <SurfaceList
            surfaces={list}
            canAdmin={canAdmin}
            canEdit={canView}
            callbacks={{
              onEditSurface: (surface) => setDialog({ kind: "surface-edit", surface }),
              onNewScreen: (surfaceId) => setDialog({ kind: "screen-new", surfaceId }),
              onEditScreen: (surface, screen) =>
                setDialog({ kind: "screen-edit", surfaceId: surface.id, screen }),
              onEditItems: (screen) => setDialog({ kind: "items", screen }),
            }}
          />
        )}
      </div>

      {dialog?.kind === "surface-new" ? (
        <SurfaceFormDialog onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "surface-edit" ? (
        <SurfaceFormDialog surface={dialog.surface} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "screen-new" ? (
        <ScreenFormDialog surfaceId={dialog.surfaceId} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "screen-edit" ? (
        <ScreenFormDialog
          surfaceId={dialog.surfaceId}
          screen={dialog.screen}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "items" ? (
        <ScreenItemsEditor screen={dialog.screen} onClose={() => setDialog(null)} />
      ) : null}
    </AppShell>
  );
}

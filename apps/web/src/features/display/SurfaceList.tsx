/**
 * Liste des surfaces d'affichage et de leurs écrans (M7-12). Chaque surface est une
 * carte ; ses écrans (template + activation) sont listés dessous. Les actions de
 * **création/suppression** (surface & écran) ne sont rendues que pour `admin`
 * (`canAdmin`) ; l'**édition** (écran, produits) est ouverte aux rôles RU (`canEdit`).
 * L'API reste l'autorité.
 */

import { Loader2, Monitor, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import type { DisplayScreen, DisplaySurface } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button, buttonVariants } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";

import { useRemoveScreen, useRemoveSurface, useScreens } from "./hooks";
import { TEMPLATE_LABELS } from "./labels";

export interface SurfaceListCallbacks {
  onEditSurface: (surface: DisplaySurface) => void;
  onNewScreen: (surfaceId: string) => void;
  onEditScreen: (surface: DisplaySurface, screen: DisplayScreen) => void;
  onEditItems: (screen: DisplayScreen) => void;
}

export function SurfaceList({
  surfaces,
  canAdmin,
  canEdit,
  callbacks,
}: {
  surfaces: DisplaySurface[];
  canAdmin: boolean;
  canEdit: boolean;
  callbacks: SurfaceListCallbacks;
}) {
  return (
    <div className="flex flex-col gap-4">
      {surfaces.map((surface) => (
        <SurfaceCard
          key={surface.id}
          surface={surface}
          canAdmin={canAdmin}
          canEdit={canEdit}
          callbacks={callbacks}
        />
      ))}
    </div>
  );
}

function SurfaceCard({
  surface,
  canAdmin,
  canEdit,
  callbacks,
}: {
  surface: DisplaySurface;
  canAdmin: boolean;
  canEdit: boolean;
  callbacks: SurfaceListCallbacks;
}) {
  const screens = useScreens(surface.id);
  const removeSurface = useRemoveSurface();
  const removeScreen = useRemoveScreen();
  const list = screens.data ?? [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">{surface.name}</h3>
              {!surface.isActive ? <Badge tone="muted">Inactive</Badge> : null}
            </div>
            {surface.description ? (
              <p className="text-sm text-muted-foreground">{surface.description}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {canEdit ? (
              <Button variant="outline" onClick={() => callbacks.onEditSurface(surface)}>
                Éditer
              </Button>
            ) : null}
            {canAdmin ? (
              <Button
                variant="outline"
                onClick={() => removeSurface.mutate(surface.id)}
                disabled={removeSurface.isPending}
              >
                Supprimer
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {screens.isPending ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              Chargement des écrans…
            </div>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun écran sur cette surface.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {list.map((screen) => (
                <li
                  key={screen.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{screen.name}</span>
                    <Badge tone="neutral">{TEMPLATE_LABELS[screen.template]}</Badge>
                    {!screen.isActive ? <Badge tone="muted">Inactif</Badge> : null}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to={`/display/screen/${screen.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "outline" })}
                    >
                      <Monitor className="size-5" aria-hidden="true" />
                      Afficher
                    </Link>
                    {canEdit ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => callbacks.onEditScreen(surface, screen)}
                        >
                          Éditer
                        </Button>
                        <Button variant="outline" onClick={() => callbacks.onEditItems(screen)}>
                          Produits
                        </Button>
                      </>
                    ) : null}
                    {canAdmin ? (
                      <Button
                        variant="outline"
                        onClick={() => removeScreen.mutate(screen.id)}
                        disabled={removeScreen.isPending}
                      >
                        Supprimer
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canAdmin ? (
            <Button
              variant="ghost"
              className="self-start"
              onClick={() => callbacks.onNewScreen(surface.id)}
            >
              <Plus className="size-5" aria-hidden="true" />
              Nouvel écran
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

import { Loader2, LogOut, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useDeactivateEquipmentProfile, useEquipmentProfiles } from "@/features/equipment/hooks";
import { useLogout } from "@/hooks/useAuth";
import type { EquipmentListFilters } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

type ActiveFilter = "all" | "active" | "inactive";

const FILTER_TO_QUERY: Record<ActiveFilter, EquipmentListFilters> = {
  all: {},
  active: { active: true },
  inactive: { active: false },
};

const volumeFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function EquipmentListPage() {
  const logout = useLogout();
  const [filter, setFilter] = useState<ActiveFilter>("all");
  const filters = useMemo(() => FILTER_TO_QUERY[filter], [filter]);
  const profiles = useEquipmentProfiles(filters);
  const deactivate = useDeactivateEquipmentProfile();

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

      <main className="mx-auto max-w-4xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Équipement</h1>
          <Button asChild size="lg">
            <Link to="/equipment/new">
              <Plus className="size-5" aria-hidden="true" />
              Nouveau profil
            </Link>
          </Button>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Label htmlFor="filter-active">Filtre</Label>
          <Select
            id="filter-active"
            value={filter}
            onChange={(e) => setFilter(e.target.value as ActiveFilter)}
            className="min-w-52"
          >
            <option value="all">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </Select>
        </div>

        <div className="mt-6">
          {profiles.isPending ? (
            <div className="flex items-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              <span>Chargement des profils…</span>
            </div>
          ) : profiles.isError ? (
            <div className="flex flex-col items-start gap-3 py-12">
              <p role="alert" className="text-destructive-foreground">
                Impossible de charger les profils d'équipement.
              </p>
              <Button variant="outline" onClick={() => void profiles.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : profiles.data.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <p className="text-muted-foreground">Aucun profil d'équipement pour ce filtre.</p>
                <Button asChild>
                  <Link to="/equipment/new">Créer le premier profil</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {profiles.data.map((profile) => (
                <li key={profile.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-medium">{profile.name}</span>
                          <Badge tone={profile.isActive ? "success" : "muted"}>
                            {profile.isActive ? "Actif" : "Inactif"}
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          Volume nominal : {volumeFmt.format(profile.nominalVolumeL)} L
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button asChild variant="outline">
                          <Link to={`/equipment/${profile.id}/edit`}>
                            <Pencil className="size-5" aria-hidden="true" />
                            Modifier
                          </Link>
                        </Button>
                        {profile.isActive ? (
                          <Button
                            variant="ghost"
                            onClick={() => deactivate.mutate(profile.id)}
                            disabled={deactivate.isPending}
                          >
                            Désactiver
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

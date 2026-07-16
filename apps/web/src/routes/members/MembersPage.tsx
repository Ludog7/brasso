/**
 * Écran Fichier membres (M6-09) : liste/recherche, création/édition, rôles,
 * statut de cotisation et consentements. RBAC UI : l'écran et les actions sont
 * **réservés** à `admin`/`rgpd` (matrice §3.5) ; les autres rôles voient un message
 * d'accès refusé (l'API renverrait 403 de toute façon). Minimisation §6 : la date
 * de naissance est optionnelle (gérée dans le formulaire).
 */

import type { MembershipStatus } from "@brasso/core";
import { Loader2, LogOut, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useMembers } from "@/features/members/hooks";
import { MemberFormDialog } from "@/features/members/MemberFormDialog";
import { MemberList } from "@/features/members/MemberList";
import { useLogout } from "@/hooks/useAuth";
import type { Member } from "@/lib/api";
import { canManageMembers } from "@/lib/rbac";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

type MembershipFilter = MembershipStatus | "ALL";

type Dialog = { mode: "create" } | { mode: "edit"; member: Member } | null;

function PageShell({ children }: { children: React.ReactNode }) {
  const logout = useLogout();
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
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}

export function MembersPage() {
  const user = useSession((s) => s.user);
  const [search, setSearch] = useState("");
  const [membership, setMembership] = useState<MembershipFilter>("ALL");
  const [dialog, setDialog] = useState<Dialog>(null);

  const canManage = canManageMembers(user?.roles ?? []);
  const filters = {
    search: search.trim() || undefined,
    membership: membership === "ALL" ? undefined : membership,
  };
  const members = useMembers(filters, canManage);
  const list = members.data ?? [];

  if (!canManage) {
    return (
      <PageShell>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p role="alert">Accès réservé aux rôles habilités (administration, référent RGPD).</p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus className="size-5" aria-hidden="true" />
          Nouveau membre
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="member-search">Rechercher</Label>
          <Input
            id="member-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, numéro d'adhérent ou email"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="member-membership">Statut</Label>
          <Select
            id="member-membership"
            value={membership}
            onChange={(e) => setMembership(e.target.value as MembershipFilter)}
            className="min-w-44"
          >
            <option value="ALL">Tous</option>
            <option value="A_JOUR">À jour</option>
            <option value="EN_RETARD">En retard</option>
          </Select>
        </div>
      </div>

      <div className="mt-6">
        {members.isPending ? (
          <div className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            <span>Chargement des membres…</span>
          </div>
        ) : members.isError ? (
          <div className="flex flex-col items-start gap-3 py-12">
            <p role="alert" className="text-destructive-foreground">
              Impossible de charger les membres.
            </p>
            <Button variant="outline" onClick={() => void members.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Aucun membre pour ces critères.
            </CardContent>
          </Card>
        ) : (
          <MemberList members={list} onSelect={(member) => setDialog({ mode: "edit", member })} />
        )}
      </div>

      {dialog?.mode === "create" ? <MemberFormDialog onClose={() => setDialog(null)} /> : null}
      {dialog?.mode === "edit" ? (
        <MemberFormDialog member={dialog.member} onClose={() => setDialog(null)} />
      ) : null}
    </PageShell>
  );
}

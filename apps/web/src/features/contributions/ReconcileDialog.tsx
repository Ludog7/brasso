/**
 * Assignation d'une cotisation à un membre (M6-10, repli manuel du rapprochement).
 * Recherche d'un membre puis assignation → `POST /transactions/:id/reconcile` ; à
 * la réussite le membre passe **A_JOUR** (dérivé côté API). RBAC : `membres:update`.
 */

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { useMembers } from "@/features/members/hooks";
import { MembershipBadge } from "@/features/members/MembershipBadge";
import type { Contribution } from "@/lib/api";
import { Button } from "@/ui/button";
import { DialogShell } from "@/ui/dialog-shell";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export function ReconcileDialog({
  contribution,
  onReconcile,
  reconciling,
  onClose,
}: {
  contribution: Contribution;
  onReconcile: (memberId: string) => void;
  reconciling: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const members = useMembers({ search: search.trim() || undefined });
  const list = members.data ?? [];

  return (
    <DialogShell
      title="Rapprocher la cotisation"
      description={`${eurFmt.format(contribution.amountCents / 100)} — ${dateFmt.format(
        new Date(contribution.occurredAt),
      )} — réf. ${contribution.externalId}`}
      onClose={onClose}
      busy={reconciling}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reconcile-search">Rechercher un membre</Label>
          <Input
            id="reconcile-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, numéro d'adhérent ou email"
          />
        </div>

        {members.isPending ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span>Recherche…</span>
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun membre trouvé.</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {list.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {member.firstName} {member.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    n° {member.memberNumber} · {member.email ?? "sans email"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MembershipBadge status={member.membership} />
                  <Button
                    variant="outline"
                    disabled={reconciling}
                    aria-label={`Assigner à ${member.firstName} ${member.lastName}`}
                    onClick={() => onReconcile(member.id)}
                  >
                    Assigner
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={reconciling}>
            Fermer
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

/**
 * Tableau du fichier membres (M6-09) : numéro d'adhérent, identité, email, statut
 * de cotisation (`MembershipBadge`) et rôles associatifs. Le nom est un bouton →
 * ouvre la fiche (détail/édition + consentements). Lecture seule d'affichage : les
 * droits d'écriture sont gérés en amont (RBAC UI + API autorité).
 */

import type { Member } from "@/lib/api";
import { Badge } from "@/ui/badge";

import { ASSOCIATIVE_ROLE_LABELS } from "./labels";
import { MembershipBadge } from "./MembershipBadge";

export function MemberList({
  members,
  onSelect,
}: {
  members: Member[];
  onSelect: (member: Member) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">N° adhérent</th>
            <th className="py-2 pr-4 font-medium">Membre</th>
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 pr-4 font-medium">Statut</th>
            <th className="py-2 font-medium">Rôles</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const fullName = `${member.firstName} ${member.lastName}`;
            return (
              <tr key={member.id} className="border-t border-border align-middle">
                <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                  {member.memberNumber}
                </td>
                <td className="py-3 pr-4">
                  <button
                    type="button"
                    onClick={() => onSelect(member)}
                    className="rounded font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {fullName}
                  </button>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{member.email ?? "—"}</td>
                <td className="py-3 pr-4">
                  <MembershipBadge status={member.membership} />
                </td>
                <td className="py-3">
                  {member.roles.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {member.roles.map((role) => (
                        <Badge key={role} tone="neutral">
                          {ASSOCIATIVE_ROLE_LABELS[role]}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Journal d'audit (M6-10) — lecture seule (§3.4). Liste paginée + filtres (action,
 * type de ressource, membre). Les libellés d'action sont ceux tracés par l'API
 * (MEMBER_*, CONSENT_*, CONTRIBUTION_RECONCILE). Réservé `admin`/`rgpd` (garde amont).
 */

import { Loader2 } from "lucide-react";
import { useState } from "react";

import type { AuditEntry } from "@/lib/api";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

import { useAuditLog } from "./hooks";

const PAGE_SIZE = 50;

const ACTIONS = [
  "MEMBER_READ",
  "MEMBER_CREATE",
  "MEMBER_UPDATE",
  "CONSENT_READ",
  "CONSENT_CHANGE",
  "MEMBER_EXPORT",
  "MEMBER_ANONYMIZE",
  "CONTRIBUTION_RECONCILE",
];

const RESOURCE_TYPES = ["member", "transaction"];

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

export function AuditLogView({ enabled = true }: { enabled?: boolean }) {
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [memberId, setMemberId] = useState("");
  const [offset, setOffset] = useState(0);

  const filters = {
    action: action || undefined,
    resourceType: resourceType || undefined,
    memberId: memberId.trim() || undefined,
    limit: PAGE_SIZE,
    offset,
  };
  const audit = useAuditLog(filters, enabled);
  const entries = audit.data?.entries ?? [];
  const total = audit.data?.total ?? 0;

  const resetOffset = (fn: () => void): void => {
    setOffset(0);
    fn();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-action">Action</Label>
          <Select
            id="audit-action"
            value={action}
            onChange={(e) => resetOffset(() => setAction(e.target.value))}
            className="min-w-56"
          >
            <option value="">Toutes</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-resource">Ressource</Label>
          <Select
            id="audit-resource"
            value={resourceType}
            onChange={(e) => resetOffset(() => setResourceType(e.target.value))}
            className="min-w-44"
          >
            <option value="">Toutes</option>
            {RESOURCE_TYPES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-member">ID membre</Label>
          <Input
            id="audit-member"
            value={memberId}
            onChange={(e) => resetOffset(() => setMemberId(e.target.value))}
            placeholder="Filtrer par membre"
          />
        </div>
      </div>

      {audit.isPending ? (
        <div className="flex items-center gap-3 py-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden="true" />
          <span>Chargement du journal…</span>
        </div>
      ) : audit.isError ? (
        <div className="flex flex-col items-start gap-3 py-12">
          <p role="alert" className="text-destructive-foreground">
            Impossible de charger le journal d'audit.
          </p>
          <Button variant="outline" onClick={() => void audit.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucune entrée pour ces critères.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">Ressource</th>
                  <th className="py-2 pr-4 font-medium">Membre</th>
                  <th className="py-2 pr-4 font-medium">Utilisateur</th>
                  <th className="py-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry: AuditEntry) => (
                  <tr key={entry.id} className="border-t border-border align-middle">
                    <td className="py-3 pr-4 whitespace-nowrap tabular-nums text-muted-foreground">
                      {dateTimeFmt.format(new Date(entry.createdAt))}
                    </td>
                    <td className="py-3 pr-4 font-medium">{entry.action}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{entry.resourceType}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{entry.memberId ?? "—"}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{entry.userId ?? "système"}</td>
                    <td className="py-3 text-muted-foreground">{entry.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} sur {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Suivant
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

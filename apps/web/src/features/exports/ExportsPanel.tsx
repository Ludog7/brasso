/**
 * Panneau d'export CSV comptable (M7-11) : choix du type (ventes / cotisations /
 * mouvements) et de la période (par défaut le **mois courant**), puis téléchargement
 * du CSV via un fetch authentifié. Read-only (ADR-09) : ce panneau ne fait que lire.
 */

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { ApiError, type ExportType } from "@/lib/api";
import { Button } from "@/ui/button";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

import { useDownloadExport } from "./hooks";
import { EXPORT_TYPE_LABELS, EXPORT_TYPES } from "./labels";

/** `Date` → valeur d'un `<input type=date>` (`YYYY-MM-DD`). */
function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Message d'erreur lisible : 403 explicité, reste générique. */
function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "Accès refusé : votre rôle ne permet pas cet export.";
  }
  return "Téléchargement impossible. Vérifiez la période et réessayez.";
}

export function ExportsPanel() {
  const now = new Date();
  const [type, setType] = useState<ExportType>("sales");
  const [from, setFrom] = useState(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toDateInput(now));

  const download = useDownloadExport();

  const submit = (): void => {
    download.mutate({
      type,
      range: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
    });
  };

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="export-type">Type d'export</Label>
        <Select
          id="export-type"
          value={type}
          onChange={(e) => setType(e.target.value as ExportType)}
        >
          {EXPORT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EXPORT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="export-from">Du</Label>
          <input
            id="export-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="flex min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="export-to">Au</Label>
          <input
            id="export-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex min-h-12 w-full rounded-md border border-input bg-background px-4 py-3 text-base text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <Button type="button" onClick={submit} disabled={download.isPending} className="self-start">
        {download.isPending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-5" aria-hidden="true" />
        )}
        Télécharger le CSV
      </Button>

      {download.isError ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {errorMessage(download.error)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Outils RGPD d'un membre (M6-10) : **export** du dossier (téléchargement JSON) et
 * **anonymisation** (via confirmation irréversible). Rendu **uniquement** pour le
 * rôle `rgpd` (séparation des pouvoirs §3.4) — le parent garde déjà l'affichage.
 */

import { Download, Loader2, ShieldOff } from "lucide-react";
import { useState } from "react";

import { type Member, membersApi } from "@/lib/api";
import { Button } from "@/ui/button";

import { AnonymizeConfirmDialog } from "./AnonymizeConfirmDialog";

/** Déclenche un téléchargement navigateur d'un objet JSON. */
function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function RgpdActions({ member }: { member: Member }) {
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  const onExport = async (): Promise<void> => {
    setExporting(true);
    setExportError(false);
    try {
      const dossier = await membersApi.exportDossier(member.id);
      downloadJson(`dossier-membre-${member.memberNumber}.json`, dossier);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Outils RGPD">
      <h3 className="text-sm font-semibold text-foreground">Données personnelles (RGPD)</h3>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void onExport()} disabled={exporting}>
          {exporting ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-5" aria-hidden="true" />
          )}
          Exporter le dossier
        </Button>
        <Button variant="outline" onClick={() => setConfirming(true)}>
          <ShieldOff className="size-5" aria-hidden="true" />
          Anonymiser…
        </Button>
      </div>
      {exportError ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          Export impossible. Réessayez.
        </p>
      ) : null}

      {confirming ? (
        <AnonymizeConfirmDialog member={member} onClose={() => setConfirming(false)} />
      ) : null}
    </section>
  );
}

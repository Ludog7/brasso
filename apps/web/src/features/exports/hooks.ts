import { useMutation } from "@tanstack/react-query";

import { type ExportRange, exportsApi, type ExportType } from "@/lib/api";

import { triggerDownload } from "./download";

/**
 * Télécharge un export CSV : fetch authentifié (blob) puis déclenchement du download
 * navigateur. Pas de cache (mutation) — chaque clic re-génère le fichier à la période
 * courante. L'état `isPending`/`isError` pilote le bouton et le message d'erreur.
 */
export function useDownloadExport() {
  return useMutation({
    mutationFn: async ({ type, range }: { type: ExportType; range: ExportRange }) => {
      const file = await exportsApi.download(type, range);
      triggerDownload(file);
      return file;
    },
  });
}

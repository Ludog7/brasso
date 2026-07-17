/**
 * Déclenche le téléchargement d'un fichier texte côté navigateur (M7-11) : le blob
 * est déjà récupéré par un fetch **authentifié** (cookie de session) — on ne fait ici
 * qu'ancrer un lien `download` invisible et le cliquer. Même approche que l'export
 * de recette (M2-12) et le dossier RGPD (M6-10).
 */

import type { DownloadedFile } from "@/lib/api";

export function triggerDownload(file: DownloadedFile): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

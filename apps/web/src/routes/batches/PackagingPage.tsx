/**
 * Page **Conditionnement** d'un brassin (M9-13) — coquille de l'écran : en-tête,
 * garde d'état du brassin, et le formulaire (`PackagingForm`) pour la saisie.
 *
 * La garde d'état est **cohérente avec le serveur** (M9-08 : `EN_FERMENTATION`
 * ou `EN_CONDITIONNEMENT`) : proposer la saisie sur un brassin déjà terminé
 * mènerait à un 409 après avoir fait remplir tout un formulaire.
 */

import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ConditioningPanel } from "@/features/batches/ConditioningPanel";
import { useBatch } from "@/features/batches/hooks";
import { STATUS_LABELS, STATUS_TONE } from "@/features/batches/labels";
import { PackagingForm, PackagingSummary } from "@/features/batches/PackagingForm";
import type { BatchStatus, PackagingRecordResult } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

/** Statuts depuis lesquels un conditionnement est recevable (miroir M9-08). */
const PACKAGEABLE: BatchStatus[] = ["EN_FERMENTATION", "EN_CONDITIONNEMENT"];

export function PackagingPage() {
  const { id = "" } = useParams();
  const batch = useBatch(id);
  /**
   * Conditionnement qui vient d'être écrit. Détenu ici parce que l'écriture fait
   * passer le brassin en `TERMINE` : la garde d'état retire alors le formulaire,
   * et un récapitulatif qu'il détiendrait disparaîtrait avec lui.
   */
  const [result, setResult] = useState<PackagingRecordResult | null>(null);

  if (batch.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <span>Chargement du brassin…</span>
      </div>
    );
  }

  if (batch.isError || !batch.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p role="alert" className="text-destructive-foreground">
          Brassin introuvable ou injoignable.
        </p>
        <Button asChild variant="outline">
          <Link to="/batches">Retour aux brassins</Link>
        </Button>
      </div>
    );
  }

  const data = batch.data;
  const packageable = PACKAGEABLE.includes(data.status);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
        <Button asChild variant="ghost" size="icon">
          <Link to={`/batches/${id}`} aria-label="Retour au brassin">
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">Conditionnement — Brassin nº {data.batchNumber}</h1>
          <Badge tone={STATUS_TONE[data.status]}>{STATUS_LABELS[data.status]}</Badge>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
        {/* Conditionnements antérieurs **et** mise en condition (#273) : un
            conditionnement peut s'étaler sur plusieurs séances (M9-08), et le
            relevé de pression d'un fût se fait des jours après la mise en fût —
            sur cet écran, rouvert à froid. */}
        <ConditioningPanel batchId={data.id} />

        {result !== null ? (
          <PackagingSummary result={result} batchId={data.id} />
        ) : packageable ? (
          <PackagingForm batchId={data.id} batchNumber={data.batchNumber} onRecorded={setResult} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conditionnement indisponible</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Un brassin `TERMINE` arrive ici **normalement** : c'est
                  l'enregistrement du conditionnement qui l'y a mené (M9-08), et
                  on revient sur cet écran pour relever un fût. Le dire, plutôt
                  que de laisser croire à une erreur de navigation. */}
              <p role="alert" className="text-sm text-muted-foreground">
                {data.status === "TERMINE"
                  ? "Le conditionnement de ce brassin est enregistré : aucun contenant supplémentaire ne peut être saisi. La mise en condition ci-dessus reste ouverte — un relevé de pression peut encore y être fait."
                  : `Ce brassin est « ${STATUS_LABELS[data.status]} » : le conditionnement se saisit sur un brassin en fermentation ou en conditionnement.`}
              </p>
              <div>
                <Button asChild variant="outline">
                  <Link to={`/batches/${id}`}>Retour au brassin</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

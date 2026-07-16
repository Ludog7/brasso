/**
 * Consentements RGPD d'un membre (M6-09) : les 3 types (§3.4) avec **état courant**
 * résolu + bascule (chaque changement POSTe un événement append-only) et un
 * historique lisible. Source append-only : rien n'est écrasé, chaque bascule ajoute
 * une ligne.
 */

import type { ConsentType } from "@brasso/core";
import { Loader2 } from "lucide-react";

import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

import { useMemberConsents, useSetConsent } from "./hooks";
import { CONSENT_LABELS, CONSENT_TYPES } from "./labels";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const fmt = (iso: string): string => dateFmt.format(new Date(iso));

export function ConsentPanel({ memberId }: { memberId: string }) {
  const consents = useMemberConsents(memberId);
  const setConsent = useSetConsent(memberId);

  if (consents.isPending) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        <span>Chargement des consentements…</span>
      </div>
    );
  }
  if (consents.isError || !consents.data) {
    return (
      <p role="alert" className="py-4 text-sm text-destructive-foreground">
        Impossible de charger les consentements.
      </p>
    );
  }

  const { current, history } = consents.data;

  const toggle = (type: ConsentType, granted: boolean): void => {
    setConsent.mutate({ type, granted });
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Consentements">
      <h3 className="text-sm font-semibold text-foreground">Consentements RGPD</h3>

      <ul className="flex flex-col gap-3">
        {CONSENT_TYPES.map((type) => {
          const state = current[type];
          const granted = state?.granted ?? false;
          return (
            <li key={type} className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-medium">{CONSENT_LABELS[type]}</span>
                <span className="text-xs text-muted-foreground">
                  {state
                    ? `${granted ? "Accordé" : "Retiré"} le ${fmt(state.at)}`
                    : "Non renseigné"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={granted ? "success" : "muted"}>{granted ? "Accordé" : "Non"}</Badge>
                <Button
                  variant="outline"
                  disabled={setConsent.isPending}
                  onClick={() => toggle(type, !granted)}
                >
                  {granted ? "Retirer" : "Accorder"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {history.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Historique ({history.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {[...history].reverse().map((event) => (
              <li key={event.id} className="text-muted-foreground">
                {fmt(event.createdAt)} — {CONSENT_LABELS[event.type]} :{" "}
                {event.granted ? "accordé" : "retiré"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {setConsent.isError ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          Enregistrement du consentement impossible. Réessayez.
        </p>
      ) : null}
    </section>
  );
}

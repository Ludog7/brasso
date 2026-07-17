---
labels: docs, regulatory, P0
milestone: M8 — Durcissement & mise en prod
---
# M8-08 — regulatory : REG-01 — frontière NF525 (hub caisse read-only)

## Contexte
Issue réglementaire **REG-01** explicitement prévue par la spec (SPEC-ORCHESTRATION §0.2/§0.3 : « confirmation par un expert-comptable que le rôle *hub read-only* n'entre pas dans le champ des logiciels de caisse → issue REG-01, milestone M8 »). C'est un **prérequis à la mise en production**, pas au dev. Brasso n'encaisse jamais : il **ingère des transactions externes en lecture seule** (ADR-09), sans créer/modifier d'encaissement. Ce ticket **constitue le dossier** qui étaye cette frontière et **trace la validation externe**. SOURCE : `SPEC-ORCHESTRATION.md` §0.2/§0.3, ADR-09 (transactions externes read-only) ; `SPEC-FONCTIONNELLE.md` §Caisse & Comptabilité.

## Objectif
Un dossier clair démontre que le hub caisse de Brasso est read-only (hors champ NF525) et l'affirmation est soumise à un expert-comptable pour validation, dont la réponse est tracée.

## Périmètre technique
- Fichiers/dossiers concernés : `docs/regulatory/REG-01-nf525.md` (dossier + checklist + espace de traçabilité de la validation). Documentation uniquement.
- Hors périmètre explicite : toute modification de code (le comportement read-only est **déjà** garanti par ADR-09/M7) ; l'obtention effective de l'avis (acte externe, hors session Claude) — on **prépare et on trace**.

## Spécification
Le dossier doit contenir :
- **Argumentaire de frontière** : Brasso ne crée/modifie **aucun** encaissement ; les paiements sont réalisés par SumUp/Zettle/HelloAsso ; Brasso reçoit des **transactions externes append-only** (table `ExternalTransaction`, ADR-09) exclusivement par **webhooks signés**, sans écriture retour vers les caisses ; le mode dégradé « non mappé » ne fait que **signaler** (aucune écriture comptable).
- **Preuves techniques** : pointeurs vers ADR-09, l'immuabilité append-only, l'absence de route d'écriture de transaction (lecture seule côté API), les exports CSV = **restitution** et non tenue de caisse.
- **Points à faire confirmer** par l'expert-comptable : le rôle read-only n'entre pas dans le champ des logiciels de caisse assujettis NF525 ; le cas échéant, réserves/conditions.
- **Traçabilité** : date de sollicitation, interlocuteur, réponse/verdict, conditions éventuelles → **gate go-live** (la mise en prod est conditionnée à un avis favorable ou à la levée des réserves).

## Definition of Done
- [ ] `docs/regulatory/REG-01-nf525.md` : argumentaire de frontière + preuves techniques (ADR-09, append-only, read-only) + questions à l'expert + section de traçabilité du verdict
- [ ] Checklist de mise en prod mentionnant REG-01 comme **gate** bloquant le go-live tant que non validé
- [ ] Pas de régression (docs uniquement)
- [ ] Critère observable : le dossier est autoportant et prêt à être transmis à un expert-comptable ; la décision se consigne dans le fichier

## Dépendances
Bloqué par : validation de la démo M7 (hub caisse M7 livré, ADR-09) — Bloque : mise en production

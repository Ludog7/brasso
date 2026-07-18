# REG-02 — Relecture pH / stabilisation (hygiène alimentaire, HACCP)

> Dossier préparatoire à soumettre à une personne compétente en hygiène
> alimentaire (HACCP) avant la mise en production. Il inventorie le wording et la
> logique d'alerte pH / stabilisation de Brasso et rassemble les éléments à
> relire ; il ne constitue ni un avis d'hygiène, ni une attestation de
> conformité, ni une analyse HACCP.

## 1. Objet et cadrage (ADR-11)

Brasso assiste la conception de recettes et le déroulé du Jour J. Sur les écrans
touchant au pH et à la stabilisation, la plateforme affiche des **indicateurs
d'aide à la décision** : elle décrit une mesure ou signale une zone de vigilance,
mais **n'affirme jamais** qu'un produit est « conforme » ou « sûr », et ne prend
**aucune décision automatique** de sécurité alimentaire. Cette règle est figée par
l'ADR-11 « Indicateurs pH/sécurité = aide à la décision, jamais validation »
([SPEC-ORCHESTRATION.md](../SPEC-ORCHESTRATION.md#0-décisions-darchitecture-adr-résumés)),
rappelée dans [CLAUDE.md](../../CLAUDE.md) et la
[spec fonctionnelle](../SPEC-FONCTIONNELLE.md).

Un **disclaimer permanent** accompagne ces écrans, défini une seule fois côté
`core` ([`FOOD_SAFETY_DISCLAIMER`](../../packages/core/src/engines/common.ts)) :

> *« Indicateur d'aide à la décision — ne remplace pas une validation d'hygiène
> alimentaire professionnelle. »*

Ce ticket **prépare et trace** la relecture par une personne compétente HACCP ; il
ne modifie aucun wording (déjà cadré ADR-11). Toute correction **issue** de la
relecture fera l'objet d'un ticket dédié `type:regulatory`.

## 2. Inventaire des écrans et messages pH / stabilisation

| Écran / brique | Ce qui est affiché | Wording (extrait) | Source |
| --- | --- | --- | --- |
| Éditeur SOFT — panneau indicateurs | Statut pH descriptif + rappel de stabilisation + disclaimer permanent | « Sous le seuil 4,6 » / « Au-dessus du seuil 4,6 — zone de vigilance » ; « une stabilisation est nécessaire (indicateur d'aide à la décision) » | [soft/IndicatorPanel.tsx](../../apps/web/src/features/recipes/soft/IndicatorPanel.tsx) |
| Éditeur ALT — panneau indicateurs | Statut pH descriptif + indicateur de risque de carbonatation (surpression bouteille) + disclaimer permanent | « Risque de surpression en bouteille : sucre résiduel fermentescible, sans stabilisation, conservé à température ambiante. » | [alt/IndicatorPanel.tsx](../../apps/web/src/features/recipes/alt/IndicatorPanel.tsx) |
| Jour J — palier de stabilisation | Confirmation manuelle de la stabilisation en température d'un palier ; température relevée **optionnelle**, journalisée si fournie ; **aucun** compte à rebours avant confirmation | « Amène le moût à N °C, puis confirme. » / « Confirmer la stabilisation » | [day/StabilizationGate.tsx](../../apps/web/src/features/day/StabilizationGate.tsx) |
| Jour J — écart de mesure | Écart **indicatif** d'une mesure au modèle, jamais un verdict | « Écart ±X vs modèle Y » / « Proche du modèle » | [day/DeviationHint.tsx](../../apps/web/src/features/day/DeviationHint.tsx) |
| Règles de publication (`core`) | Motifs de blocage de publication libellés en **indicateur sécurité** | « pH obligatoire pour publier… (indicateur sécurité) » ; « Stabilisation requise pour un stockage ambiant à pH > 4.6 (indicateur sécurité) » | [engines/publication.ts](../../packages/core/src/engines/publication.ts) |

Le disclaimer et les statuts pH proviennent d'une **source unique** `core`
([engines/common.ts](../../packages/core/src/engines/common.ts)) : aucun écran ne
réécrit ces libellés, ce qui garantit un wording homogène et auditables.

## 3. Logique d'alerte et seuils (à examiner)

| Sujet | Ce qui est calculé | Ce qui n'est **jamais** affirmé | Élément de preuve |
| --- | --- | --- | --- |
| Statut pH | Position de la mesure vis-à-vis du seuil : `acidic` (pH ≤ 4,6) ou `low_acid` (pH > 4,6, « zone de vigilance ») | Aucun booléen « safe » / « conforme » ; l'indicateur porte `kind: "indicator"` et le disclaimer | [`phIndicator`](../../packages/core/src/engines/common.ts) |
| Seuil pH 4,6 | Frontière des *low-acid foods* : au-dessus de 4,6, la boisson entre dans la zone exigeant des contrôles microbiologiques (justification du choix de borne) | Que le respect du seuil vaut sécurité ; c'est un repère, pas une garantie | [`PH_LOW_ACID_THRESHOLD`](../../packages/core/src/engines/common.ts) |
| Stabilisation SOFT | Rappel déclenché si **stockage ambiant ET pH > 4,6** ; bloque la publication tant qu'aucune méthode de stabilisation n'est renseignée | Qu'une stabilisation renseignée rend le produit « sûr » ; seule sa **présence** est vérifiée, pas son efficacité | [`computeSoftDrink`](../../packages/core/src/engines/softDrink.ts), [publication.ts](../../packages/core/src/engines/publication.ts) |
| Publication ALT | pH **et** méthode de stabilisation obligatoires pour publier (ADR-06) | Qu'une recette publiée est validée sur le plan sanitaire | [publication.ts](../../packages/core/src/engines/publication.ts) |
| Risque de carbonatation ALT | Signale une surpression **mécanique** possible en bouteille (sucre résiduel fermentescible, sans stabilisation, ambiant) | Qu'un produit sans alerte est sans risque | [alt/IndicatorPanel.tsx](../../apps/web/src/features/recipes/alt/IndicatorPanel.tsx) |
| Palier de stabilisation Jour J | Confirmation **humaine** de la stabilisation en température ; la mesure relevée est optionnelle et seulement journalisée | Aucune décision automatique ; rien n'est validé sans action de l'opérateur | [day/StabilizationGate.tsx](../../apps/web/src/features/day/StabilizationGate.tsx) |

Points de vigilance transmis au relecteur : le seuil 4,6 et les règles de
stabilisation sont des **repères d'aide à la décision** ; ils ne se substituent
pas à un plan HACCP, à des mesures validées, ni à un contrôle des méthodes de
stabilisation réellement employées.

## 4. Questions soumises à la personne compétente HACCP

Merci de relire, au regard de l'usage en atelier associatif :

1. La **justesse et la prudence du wording** pH / stabilisation : les libellés
   restent-ils descriptifs (« indicateur », « zone de vigilance ») sans induire
   une idée de conformité ou de sécurité garantie ?
2. La **pertinence de la logique d'alerte** : le seuil pH 4,6 et la règle
   « stockage ambiant + pH > 4,6 → stabilisation requise » sont-ils des repères
   appropriés pour ce contexte ? Manque-t-il un signalement utile (p. ex. autres
   facteurs de conservation) ?
3. Les **risques de mauvaise interprétation** en atelier : un opérateur pourrait-il
   lire un indicateur comme une validation sanitaire ? Le disclaimer permanent
   est-il suffisant et bien placé ?
4. Le cas échéant, quelles **réserves, corrections de wording ou compléments**
   appliquer avant la mise en production.

Éléments à joindre à la sollicitation : ce dossier, l'ADR-11 et un accès aux
écrans concernés (éditeurs SOFT/ALT, Jour J).

## 5. Traçabilité de la relecture HACCP

| Élément | À renseigner |
| --- | --- |
| Date de sollicitation | À renseigner |
| Association / dossier concerné | À renseigner |
| Relecteur (nom, qualité HACCP) | À renseigner |
| Coordonnées ou référence | À renseigner |
| Écrans relus | À renseigner |
| Réponse reçue le | À renseigner |
| Verdict | En attente / Favorable / Favorable avec réserves / Défavorable |
| Réserves ou corrections demandées | À renseigner |
| Tickets ouverts pour les corrections | À renseigner (n° `type:regulatory`) |
| Décision de levée du gate | À renseigner (date, responsable) |

Conserver l'avis écrit ou la référence de l'échange avec ce dossier. Une réponse
favorable avec réserves ne lève le gate qu'après ouverture, traitement et
traçabilité de chaque correction demandée.

## 6. Checklist de mise en production — gate REG-02

- [ ] Ce dossier et l'ADR-11 ont été transmis à la personne compétente HACCP.
- [ ] Les écrans pH / stabilisation lui ont été présentés (éditeurs SOFT/ALT,
  palier Jour J).
- [ ] L'avis écrit a été reçu et sa référence est renseignée dans la section de
  traçabilité.
- [ ] Le verdict est favorable, ou toutes les réserves ont été traitées via des
  tickets dédiés et validées par le relecteur.
- [ ] La décision de levée du gate est renseignée ci-dessus.

**Gate bloquant : la mise en production des écrans pH / stabilisation est
interdite tant que REG-02 n'a pas reçu un avis favorable, ou que toutes les
réserves éventuelles n'ont pas été levées et consignées.**

---
labels: web, feature, P1
milestone: M9 — Boucle brassin complète
---
# M9-14 — test : E2E « boucle brassin complète » (recette publiée → conditionnement → stock produit fini)

## Contexte
M8-05/M8-06 ont câblé Playwright sur les **4 parcours critiques**, dont un « brassage complet » qui s'arrête là où s'arrêtait le produit : à l'ensemencement. M9 étend le cycle jusqu'au stock de produits finis — le parcours critique doit donc être étendu en conséquence, sans quoi la partie la plus intégrée du milestone (conditionnement → stock → article vendable) ne serait couverte que par des tests unitaires isolés.

C'est aussi le ticket qui **prouve le critère de démo** du milestone de bout en bout, contre l'application réelle (front + API + Postgres). SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A ; SPEC-ORCHESTRATION §6 (exigences de qualité), §9 ; `e2e/README.md`.

## Objectif
Un test E2E déroule la boucle complète — d'une recette publiée jusqu'au produit fini en stock — et échoue si un maillon casse.

## Périmètre technique
- Fichiers concernés : `e2e/` (extension du parcours de brassage existant, **pas** un scénario concurrent) ; fixtures et seed de test associés ; `.github/workflows/ci.yml` si un ajustement de durée s'avère nécessaire.
- Hors périmètre explicite : les tests unitaires des tickets précédents ; les parcours caisse et adhésion (M8-06, inchangés) ; toute correction fonctionnelle — un défaut découvert ici donne lieu à un **ticket `type:bug`** rattaché à M9, jamais à un correctif silencieux (`CLAUDE.md`).

## Spécification

**A. Scénario.** Étendre le parcours de brassage existant pour couvrir, dans l'ordre :
1. planifier un brassin depuis une recette **publiée** (snapshot figé) ;
2. dérouler le Jour J : empâtage, **filtration validée manuellement sans écart** (bug 1 — vérifier l'absence de `DeviationLog`), ébullition avec **alerte de houblonnage et hors-flamme**, **assainissement du circuit**, **whirlpool**, **refroidissement validé enchaînant** sur l'ensemencement (bug 2) ;
3. saisir les durées prévisionnelles et vérifier les **jalons datés** ;
4. retrouver le brassin et sa prochaine échéance dans la **vue Brassins** ;
5. conditionner en saisissant les quantités par contenant ;
6. vérifier que le **stock de produits finis** est incrémenté, que le brassin est `TERMINE` et que l'article produit fini est **sélectionnable sur un écran d'affichage** (la preuve de bout en bout de l'arbitrage Q10).

**B. Assertions de non-régression sur les bugs.** Les deux bugs corrigés sont explicitement asservis : après validation manuelle de la filtration, **aucun** écart de procédure n'existe sur le brassin ; après validation du refroidissement à température atteinte, l'étape courante **est** l'ensemencement. Ce sont eux qui ont motivé le milestone : ils doivent échouer bruyamment s'ils réapparaissent.

**C. Vérification ADR-11.** Contrôler qu'aucun écran traversé n'affiche « stérile », « stérilisation », « conforme » ni « sûr », et que le disclaimer alimentaire est présent sur l'écran portant l'assainissement du circuit.

**D. Robustesse du test.** Sélecteurs stables (`data-testid`), aucune attente arbitraire par temporisation fixe, jeu de données isolé conforme à `e2e/README.md`. Les durées de fermentation étant longues, le scénario **ne doit pas attendre le temps réel** : les jalons se vérifient sur leurs **dates calculées**, et le passage au conditionnement s'obtient par la transition manuelle prévue en {{M9-07}}. Un test qui dormirait serait un test qui casse en CI.

**E. Budget de temps CI.** Le check `ci` est bloquant et inclut déjà les E2E : surveiller la durée ajoutée et factoriser avec le parcours existant plutôt que de dupliquer connexion et données de départ.

## Definition of Done
- [ ] Parcours E2E complet vert en local et en CI (front + API + Postgres réels)
- [ ] Assertions explicites de **non-régression des deux bugs** (validation sans écart ; enchaînement après refroidissement)
- [ ] Assertion sur l'incrément du **stock de produits finis** et sur la sélectionnabilité de l'article sur un écran d'affichage
- [ ] Vérification **ADR-11** sur les écrans traversés
- [ ] Aucune attente par temporisation fixe ; sélecteurs stables ; jeu de données isolé
- [ ] Durée ajoutée au check `ci` mesurée et rapportée dans la PR
- [ ] Lint + typecheck + CI verts ; Prettier sur tous les fichiers touchés
- [ ] Critère observable : **le critère de démo du milestone M9 est prouvé automatiquement** à chaque PR

## Dépendances
Bloqué par : {{M9-03}}, {{M9-08}}, {{M9-10}}, {{M9-11}}, {{M9-12}}, {{M9-13}} — **dernier ticket du milestone**

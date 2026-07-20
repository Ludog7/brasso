# ADR-14 — Thème clair par défaut, basculable, & thème dérivé d'une couleur de marque

- **Statut** : Acceptée
- **Date** : 2026-07-20
- **Ticket** : #288
- **Amende** : **ADR-05**, sur le seul point du thème par défaut. Le reste d'ADR-05 — React 18 + Vite, PWA installable, cible tablette d'atelier, Tailwind + shadcn/ui, gros boutons — est **inchangé**.

## Contexte & problème

ADR-05 impose « **mode sombre par défaut** », et le code l'appliquait en dur (`<html class="dark">`). Le premier test d'usage a corrigé l'hypothèse : l'application ne sert pas **que** sur une tablette d'atelier, elle sert **aussi** en bureau et en pleine lumière du jour, et le sombre imposé y a été jugé peu lisible et peu engageant.

**ADR-05 n'était pas une erreur** : elle était fondée sur une hypothèse d'usage — un poste unique, dans un atelier peu éclairé — que le terrain a élargie. C'est l'hypothèse qui a changé, pas le raisonnement. Il faut le dire ainsi, sinon on apprend à se méfier des ADR au lieu d'apprendre à les amender.

C'est le **premier renversement d'ADR du projet**. `docs/adr/README.md:11` cite d'ailleurs ce cas exact comme l'archétype : « passer au clair par défaut est un renversement, pas un réglage ».

**Le mode sombre n'est pas supprimé. Il devient un choix.** Toute la machinerie de thème est conservée intacte : ajouter `.dark` sur `<html>` restitue exactement le thème sombre (`apps/web/src/index.css:12`).

> **Inversion d'ordonnancement, assumée.** Le défaut clair a été **appliqué en dur avant** que cet ADR soit écrit (PR #285, puis #294 pour la lisibilité de l'existant) : ADR-14 **ratifie** une modification déjà en place au lieu de la précéder. C'est une décision datée de Ludo du **2026-07-20**, motivée par le fait que tout le reste de M10 — design system, volet Options, bandeau, passe sur l'existant — devait être jugé **dans le thème réellement cible** ; le faire en fin de milestone aurait imposé de réévaluer chaque écran une seconde fois. Ce n'est **pas** un contournement de la règle de `CLAUDE.md` : sans cette phrase, un lecteur ultérieur conclurait, à juste titre, qu'un invariant a été modifié sans décision.

Reste le point dur, qui est l'essentiel de cet ADR : **comment dériver un thème lisible d'une couleur choisie par un humain**, sachant qu'un utilisateur saisira aussi bien un jaune très clair qu'un bleu très sombre.

## Options envisagées

### (a) Accepter la couleur telle quelle

Fidélité totale à la marque. **Rejetée** : casse le contraste AA, qui est une exigence §6 et un enjeu d'accessibilité réel. Une couleur de marque mal choisie rendrait illisibles des surfaces entières de l'application, sans que personne ne soit prévenu.

### (b) Ajuster automatiquement la couleur jusqu'à atteindre AA

Toujours lisible, sans effort. **Rejetée comme règle générale** : l'utilisateur voit s'afficher une couleur qui **n'est pas celle qu'il a saisie**, sans comprendre pourquoi. Sur le bandeau — la surface identitaire par excellence — c'est le résultat le plus déroutant possible.

### (c) Couleur intacte pour les aplats, contraste dérivé séparément — **retenue**

La couleur saisie sert telle quelle pour les **aplats de marque** ; ce qu'on **dérive**, c'est la couleur du **texte posé dessus**. Coût : impose de distinguer nettement trois choses — la couleur de marque, la couleur de contraste dérivée, et l'accent de marque posé sur le fond du thème. Cette distinction est le prix à payer, et elle doit être tenue dans le nommage des jetons.

## Décision

### 1. Le défaut

**Thème clair par défaut**, dans les deux sens du terme : c'est le thème appliqué à l'installation, et celui appliqué quand aucune préférence n'est enregistrée. Le **mode sombre reste disponible** et se pilote par la bascule des Options (M10-11, #289).

### 2. L'algorithme de dérivation

**Espace colorimétrique : OKLCH**, celui dans lequel les jetons sont déjà écrits (`apps/web/src/index.css`). Conversion OKLCH → sRGB par la transformation d'Ottosson (OKLab → sRGB linéaire → encodage gamma).

**Ratio de contraste : WCAG 2.1.** Linéarisation de chaque canal sRGB (`c ≤ 0,04045 ? c/12,92 : ((c+0,055)/1,055)^2,4`), luminance relative `0,2126·R + 0,7152·V + 0,0722·B`, puis `(L_clair + 0,05) / (L_sombre + 0,05)`.

**Seuils** : **4,5:1** pour le texte courant ; **3:1** pour le grand texte (≥ 24 px, ou ≥ 18,66 px en gras) et pour les **éléments d'interface** (filets, bordures, icônes porteuses de sens).

Trois jetons, et la distinction entre eux est **le cœur de la décision** :

| Jeton | Règle |
|---|---|
| `--brand` | **La couleur saisie, inchangée.** Sert d'**aplat** (fond de bandeau, pastilles). Jamais modifiée. |
| `--brand-foreground` | **Dérivé** : celui de `--background` ou `--foreground` du thème courant qui **maximise** le ratio contre `--brand`. C'est le texte posé **sur** l'aplat. |
| `--brand-accent` | **Dérivé** : `--brand` si son ratio contre `--background` atteint **3:1** ; sinon on module **la seule luminosité L** par pas de **0,01** — en **assombrissant** sur fond clair, en **éclaircissant** sur fond sombre — jusqu'au premier L atteignant 3:1. **C et h sont figés** : la teinte de la marque est préservée, seule sa clarté cède. |

**La dérivation est recalculée pour chaque thème.** Ce n'est pas une précaution théorique : les valeurs de référence ci-dessous montrent deux cas **miroirs** — un jaune inutilisable en accent sur fond clair mais parfait sur fond sombre, un bleu nuit exactement l'inverse.

### 3. Valeurs de référence — opposables et testables

Calculées avec l'algorithme ci-dessus contre les jetons réels du thème (`--background` clair `oklch(0.99 0 0)`, `--foreground` clair `oklch(0.16 0.01 260)`, `--background` sombre `oklch(0.16 0.012 260)`, `--foreground` sombre `oklch(0.97 0.003 260)`). M10-11 doit **retrouver ces chiffres**.

**Cas nominal — `#2E7D32`** (vert), `oklch(0.52 0.135 144)` :

| Thème | `--brand-foreground` | Ratio | `--brand-accent` |
|---|---|---|---|
| clair | `--background` (clair) | **4,98:1** | inchangé — 4,98:1 sur le fond |
| sombre | `--foreground` (sombre) | **4,70:1** | inchangé — 3,79:1 sur le fond |

**Cas d'ajustement — `#F2C200`** (jaune vif), `oklch(0.83 0.17 91)` :

| Thème | `--brand-foreground` | Ratio | `--brand-accent` |
|---|---|---|---|
| clair | `--foreground` (sombre) | **11,55:1** | brut **1,63:1** → L 0,83 **→ 0,65** (18 pas) = **3,13:1**, soit `#B68800` |
| sombre | `--background` (clair) | **11,55:1** | inchangé — 11,55:1 sur le fond |

**Cas miroir — `#1A237E`** (bleu nuit), `oklch(0.32 0.151 270)` : accent inchangé en thème clair (12,87:1), mais brut **1,47:1** en thème sombre → L 0,32 **→ 0,50** (18 pas) = **3,13:1**.

**Cas d'échec — `#5477B2`**, `oklch(0.57 0.1 260)` : contre le texte clair **4,36:1**, contre le texte sombre **4,33:1**. **Aucune** des deux dérivations n'atteint 4,5:1.

### 4. Que faire quand aucune dérivation n'atteint AA

Le cas d'échec n'est pas une curiosité : il existe une **bande étroite de mi-luminosité**, autour de **L ≈ 0,57–0,59** en OKLCH, où une couleur est trop sombre pour porter du texte clair et trop claire pour porter du texte sombre. Un balayage de cette bande donne un meilleur ratio de **4,35:1** — sous le seuil, quelle que soit la teinte.

Dans ce cas, l'interface :

1. **affiche le ratio mesuré** (« meilleur contraste atteignable : 4,36:1 ») ;
2. **avertit** que le seuil de 4,5:1 n'est pas atteint et indique la direction utile — éclaircir ou assombrir la couleur ;
3. **n'empêche pas** d'enregistrer. C'est la couleur de l'association, pas celle de l'outil.

**Ce qu'on ne fait jamais : afficher un badge « accessible » ou « conforme ».** Ce serait exactement le travers qu'ADR-11 proscrit sur les écrans pH — transformer une mesure en verdict. **On mesure, on affiche le chiffre, on avertit ; on ne certifie pas.** Le wording suit la même règle : « indicateur », jamais « conforme ».

### 5. Persistance du choix de thème — **par poste**

Le thème est une préférence **du poste**, stockée **localement** (pas en base, pas rattachée au compte).

La raison est directe et vient d'ADR-13 : sur le poste partagé, **tous** les rôles basculent par PIN. Un thème rattaché à l'utilisateur **repeindrait l'écran entier à chaque relève** — plusieurs fois par séance de brassage, en pleine manipulation. Le thème répond d'ailleurs à une question qui n'a rien de personnel : *quelle est la lumière ambiante là où se trouve cet écran ?* La tablette de l'atelier et le portable du bureau n'ont pas la même réponse, et cette réponse ne change pas quand l'utilisateur change.

**Ce qu'on abandonne, explicitement** : quelqu'un qui préfère le sombre partout devra le régler sur chaque poste. C'est le prix, et il est faible devant un écran qui change de couleur à chaque bascule PIN.

**Application au premier rendu, sans flash.** Le thème est lu et appliqué **avant** le premier rendu, depuis le stockage local — jamais en attendant une réponse serveur. C'est une exigence d'ADR-08 autant que de confort : hors ligne, il n'y a **pas** de réponse serveur à attendre, et un thème appliqué après coup produirait un flash blanc à chaque ouverture.

### 6. Surfaces couvertes par l'identité

**Couvertes** : bandeau applicatif (logo, nom, aplat de marque) ; **écran de connexion** (nom, logo, couleur — les trois champs publics d'ADR-12) ; **écran d'affichage du bar** (M7, plein écran, vu par le public — c'est la surface la plus exposée de toute l'application) ; accents, filets et tonalités des écrans applicatifs.

**Non couvertes, délibérément** :

- **Les jetons d'état** — `--warning`, `--success`, `--destructive`. Ils sont **sémantiques** : un avertissement doit se lire comme un avertissement, quelle que soit la couleur de l'association. Les dériver de la marque ferait dépendre la lisibilité d'une alerte d'un choix esthétique. C'est la ligne à ne pas franchir.
- **Les couleurs de courbes** (`--chart-gravity`, `--chart-temperature`) : elles doivent rester **distinguables entre elles**, contrainte qui prime sur la marque.
- **Les exports CSV comptables** : données brutes, aucune mise en forme.
- **Les exports BeerXML et JSON d'interchange** : formats **normalisés**, destinés à d'autres logiciels. Y injecter de l'identité casserait l'interopérabilité que M2-10/M2-11 ont établie.

## Conséquences

### Sur la spec

Deux emplacements portaient « mode sombre par défaut », et n'en corriger qu'un laisserait la spec se contredire :

- **§0, ligne ADR-05** : mention de renvoi ajoutée, **ligne d'origine intacte** (règle de cohérence de `docs/adr/README.md`).
- **§6, règle UI atelier** : la mention devient **factuellement fausse** après cet ADR — elle est **corrigée**, pas seulement annotée. Les autres règles de la ligne (cibles ≥ 48 px, contraste AA, zéro drag-and-drop) sont **inchangées**.

Les corps de tickets déjà livrés (M0-08, M2-05, M4-08, M7-13) mentionnent encore « mode sombre par défaut ». Ils ne sont **pas** modifiés : ce sont des **archives** de ce qui était demandé à l'époque, pas des règles en vigueur.

### Sur le code (M10-11, #289)

M10-11 implémente la bascule et la dérivation **sans choisir un seuil ni un algorithme** : espace, formule de contraste, seuils, pas de modulation, jetons et valeurs de référence sont tous posés ici. Les quatre couleurs du §3 constituent son **jeu de tests** — dont le cas d'échec `#5477B2`, qui doit produire un **avertissement** et non un blocage.

### Sur M10-07 (#298)

Les fondations du design system posent les trois jetons de marque avec la sémantique du §2. Le point à ne pas manquer : `--brand` et `--brand-accent` sont **deux jetons distincts**, et non deux usages du même. Les confondre reproduirait exactement le défaut déjà tracé en **#292** sur `--destructive`, où un même jeton sert de remplissage et de texte — deux besoins de luminosité opposés.

### Conséquences négatives assumées

- **Le thème ne suit pas l'utilisateur.** Choix délibéré (§5), au prix d'un réglage par poste.
- **Une couleur de marque peut rester sous AA** si l'association y tient. On avertit, on n'impose pas — mais l'application peut donc afficher, en connaissance de cause, un contraste insuffisant sur ses surfaces de marque.
- **La dérivation dépend des jetons de fond.** Si `--background` change, toutes les valeurs de référence du §3 doivent être recalculées. Le piège est déjà documenté dans `index.css` : un écart de luminosité de 0,01 entre `--card` et `--background` a suffi, en #290, à faire passer un jeton de 4,61:1 à 4,49:1. **Les tests doivent mesurer sur le fond réellement utilisé.**
- **`--brand-accent` peut s'éloigner visiblement de `--brand`** (18 pas de luminosité dans les deux cas mesurés). L'écart est le prix de la lisibilité ; l'interface doit montrer les deux, pour que le choix se fasse en connaissance de cause.

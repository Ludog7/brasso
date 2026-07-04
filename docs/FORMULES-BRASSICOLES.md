# BrewTrack — Référentiel des formules brassicoles

> **Spécification de référence du package `core`.** Toutes les formules à implémenter, avec conventions d'unités, constantes, cas limites et valeurs de validation.
>
> En cas de divergence entre une implémentation et ce document, **ce document fait foi**.

---

## 0. Conventions globales

| Grandeur | Unité interne (stockage / calcul) | Notes |
|---|---|---|
| Masse | gramme (g) | conversion kg/lb dans `units.ts` |
| Volume | litre (L) | conversion gal dans `units.ts` |
| Température | °C | conversion °F dans `units.ts` |
| Densité | SG brute (ex. `1.052`) | jamais en points pour le stockage |
| Couleur | EBC (interne) | SRM/°L convertis à l'affichage |
| Acides alpha | **fraction** (`0.062` pour 6,2 %) | jamais en % dans les calculs |
| Pression | bar (interne) | conversion PSI dans `units.ts` |

**Notations utilisées dans ce document :**

```
SG       = densité (specific gravity), ex. 1.050
points   = (SG − 1) × 1000          → 1.050 = 50 points
P (°P)   = degrés Plato
Bx (°Bx) = degrés Brix
e        = base du log népérien (Math.E)
```

### 0.1 Conversions de base (à centraliser dans `units.ts`)

```
// Masse / volume
kg   = g / 1000
lb   = g / 453.592
gal  = L / 3.78541

// Température
C    = (F − 32) × 5/9
F    = C × 9/5 + 32

// Densité ↔ points
points(SG) = (SG − 1) × 1000
SG(points) = 1 + points / 1000

// SG ↔ Plato (approximation polynomiale, valable bières)
P  = −616.868 + 1111.14 × SG − 630.272 × SG² + 135.997 × SG³
SG = 1 + (P / (258.6 − (P / 258.2) × 227.1))

// Brix ↔ Plato : nominalement égaux à 3 décimales → Bx ≈ P

// Couleur
SRM = EBC / 1.97
EBC = SRM × 1.97
SRM = 1.3546 × °L − 0.76   // si conversion °Lovibond nécessaire

// Pression
bar  = PSI × 0.0689476
PSI  = bar / 0.0689476
```

---

## 1. Densité initiale (OG)

### 1.1 Principe

Chaque fermentescible apporte un potentiel de sucre. Le **rendement de brassage** (`efficiency`) s'applique aux grains empâtés ; les sucres et extraits liquides/secs ajoutés sont considérés à 100 %.

### 1.2 Formule (référentiel métrique)

Potentiel exprimé en **points par kg dilué dans 1 L** (`potentialSg`, ex. malt Pale ≈ `1.037` → 37 points/kg/L).

```
Pour chaque fermentescible i :
  pi      = points(potentialSg_i)              // ex. 37
  massKg_i = amountG_i / 1000
  eff_i   = isMashable_i ? efficiencyPct/100 : 1.0

  contribPoints_i = pi × massKg_i × eff_i      // points·L

OG_points = ( Σ contribPoints_i ) / batchVolumeL
OG        = 1 + OG_points / 1000
```

> **Variante "boil gravity"** : pour calculer l'IBU il faut la densité *pendant l'ébullition*, donc rapportée au `boilVolumeL` et non au `batchVolumeL`. Voir §4.2.

### 1.3 Cas limites

- `batchVolumeL = 0` → erreur de validation (division interdite).
- Aucun fermentescible → `OG = 1.000`.
- Rendement plausible : **borner** `efficiencyPct` ∈ [50, 95], avertir hors plage.

---

## 2. Densité finale (FG)

```
attén = yeastAttenuationPct / 100     // levure principale ; si plusieurs, prendre la dominante
FG_points = OG_points × (1 − attén)
FG        = 1 + FG_points / 1000
```

> L'atténuation est *apparente* (mesurée au densimètre). C'est la convention de toutes les bases de données de levures grand public. Ne pas confondre avec l'atténuation réelle.

**Cas limites** : `attén` ∈ [0,5 ; 0,95] en pratique. Hors plage → avertissement.

---

## 3. Taux d'alcool (ABV / ABW)

### 3.1 Formule standard (par défaut)

```
ABV (%) = (OG − FG) × 131.25
```

Suffisante jusqu'à ~6–7 % ABV. Au-delà, elle sous-estime légèrement.

### 3.2 Formule alternative précise (option "bières fortes")

```
ABV (%) = ( 76.08 × (OG − FG) / (1.775 − OG) ) × ( FG / 0.794 )
```

### 3.3 Alcool en masse (ABW), si besoin d'affichage

```
ABW (%) = ABV × 0.789 / FG
```

### 3.4 Interface attendue

```ts
calcAbv(og: number, fg: number, method: 'standard' | 'alternate' = 'standard'): number
```

**Validation** : American IPA OG 1.060 / FG 1.012 → ABV standard ≈ **6,30 %**.

---

## 4. Amertume (IBU)

### 4.1 Méthode Tinseth (par défaut)

Pour chaque ajout de houblon **en ébullition** :

```
// densité de référence = densité du moût en ébullition (boil gravity)
fDensité = 1.65 × 0.000125 ^ (boilGravity − 1)
fTemps   = (1 − e^(−0.04 × timeMin)) / 4.15
util     = fDensité × fTemps

mgAlphaParL = (alphaFraction × amountG × 1000) / batchVolumeL
ibuAjout    = mgAlphaParL × util

IBU_total = Σ ibuAjout
```

### 4.2 Quelle densité utiliser ?

`boilGravity` = OG rapportée au volume d'ébullition :

```
boilGravity = 1 + ( OG_points × batchVolumeL / boilVolumeL ) / 1000
```

### 4.3 Règles par type d'ajout (`use`)

| `use` | Traitement IBU |
|---|---|
| `boil` | formule complète, `timeMin` = durée d'ébullition restante |
| `first_wort` | traité comme `boil` à `timeMin = boilTimeMin` (+ ~10 % optionnel) |
| `whirlpool` / `hop_stand` | utilisation réduite : appliquer `timeMin` effectif réduit **ou** facteur `× 0.5`. Rendre configurable. |
| `dry_hop` | **IBU = 0** |

### 4.4 Corrections optionnelles (configurables)

```
// Forme du houblon
pellets : util × 1.10   (option "pellet factor")
cryo    : tenir compte du % alpha déjà plus élevé, pas de facteur supplémentaire

// Bag / sachet en ébullition : util × ~0.90 (optionnel)
```

### 4.5 Méthode Rager (alternative)

```
util = 18.11 + 13.86 × tanh( (timeMin − 31.32) / 18.27 )   // en %
GA   = (boilGravity > 1.050) ? (boilGravity − 1.050) / 0.2 : 0   // gravity adjustment
ibuAjout = (amountG × util/100 × alphaFraction × 1000)
           / ( batchVolumeL × (1 + GA) )
```

### 4.6 Interface attendue

```ts
calcIbu(
  additions: HopAddition[],
  boilGravity: number,
  batchVolumeL: number,
  method: 'tinseth' | 'rager' = 'tinseth'
): number
```

**Validation Tinseth** : 28 g de houblon à 6 % alpha, 60 min, boilGravity 1.050, batch 20 L → ≈ **22 IBU** (tolérance ±1).

---

## 5. Couleur (EBC / SRM) — Morey

```
// Conversion impériale interne
amountLb_i  = amountG_i / 453.592
colorL_i    = ebcToLovibond(colorEbc_i)   // ou utiliser directement °L si dispo
batchGal    = batchVolumeL / 3.78541

MCU = Σ ( amountLb_i × colorL_i ) / batchGal
SRM = 1.4922 × MCU ^ 0.6859
EBC = SRM × 1.97
```

`ebcToLovibond(ebc) = (ebc / 1.97 + 0.76) / 1.3546`

### 5.1 Pastille couleur

`ebcToHex(ebc)` par interpolation (voir annexe A). Ne pas figer une table de 80 lignes.

**Validation** : 5 kg Pale (7 EBC ≈ 3,5 °L) dans 20 L → EBC ≈ **11–12** (ambré clair).

---

## 6. Empâtage & eau

### 6.1 Eau d'empâtage

```
eauEmpatageL = ratioLkg × masseGrainsKg     // ratio défaut 3.0 L/kg (borne usuelle 2.5–4.0)
```

### 6.2 Eau de rinçage (sparge)

```
volPreBoil  = boilVolumeL
absorption  = 1.0 L/kg × masseGrainsKg       // eau retenue par la drêche (≈ 1 L/kg)
pertesMort  = volumeMortMaischeL              // dead space, configurable
eauRinçageL = volPreBoil + absorption + pertesMort − eauEmpatageL
```

### 6.3 Température d'eau d'empâtage (strike water)

```
Tstrike = (0.41 / R) × (Tcible − Tgrain) + Tcible
  R       = ratio eau/grain (L/kg)
  Tcible  = température de palier visée (°C)
  Tgrain  = température initiale des grains (°C)
  0.41    = chaleur spécifique du grain / eau (approx.)
```

### 6.4 Correction de palier (infusion d'eau bouillante)

```
Veau_ajout = (Tcible − Tactuel) × (0.41 × masseGrainsKg + VeauActuelleL)
             / (Tbouillante − Tcible)
```

---

## 7. Densimètre & réfractomètre

### 7.1 Correction densimètre en température

Le densimètre est calibré à une température (souvent 20 °C). Lecture à une autre T° → correction.

```
SGcorrigé = SGlu × ( ρ(Tlecture) / ρ(Tcalibration) )
```

Approximation polynomiale usuelle (T en °F, calibration 20 °C / 68 °F) :

```
correction = 1.00130346
           − 1.34722124e−4 × Tf
           + 2.04052596e−6 × Tf²
           − 2.32820948e−9 × Tf³
SGcorrigé = SGlu × correction(Tlecture) / correction(Tcalibration)
```

### 7.2 Réfractomètre — lecture moût NON fermenté

Le réfractomètre lit un **Brix WRI** (wort refraction index) qu'il faut diviser par le **WCF** (wort correction factor, défaut **1.04**) :

```
BrixRéel = BrixLu / WCF            // WCF défaut 1.04, plage 1.02–1.06
P ≈ BrixRéel                       // Brix ≈ Plato
SG = plato_to_sg(P)
```

> Le WCF est **propre à l'instrument**. Permettre à l'utilisateur de le régler dans les paramètres (déterminé empiriquement : moyenne de `BrixLu / Plato_densimètre` sur plusieurs moûts).

### 7.3 Réfractomètre — lecture APRÈS fermentation (correction alcool)

Indispensable : l'éthanol fausse la lecture. Deux mesures requises : **Brix initial (OB)** et **Brix courant/final (FB)**, tous deux au réfractomètre.

**Méthode « standard » simple (équation grand public, corrigée cf. bug #43) :**

```
ob = OB / WCF ; fb = FB / WCF

FGtrue = 1.001843
       − 0.002318474 × ob
       − 0.000007775 × ob²
       − 0.000000034 × ob³
       + 0.00574     × fb
       + 0.00003344  × fb²
       + 0.000000086 × fb³
```

> ⚠️ L'ancienne « forme simplifiée » `(FB × WCF) − (OB − FB) × 0.00085` renvoyait ~6.76 (pas une SG) : formule cassée, remplacée par l'équation standard ci-dessus (bug #43).

**Méthode Terrill cubique (RECOMMANDÉE — la plus précise) :**

```
ob = OB / WCF
fb = FB / WCF

FGtrue = 1.0000
       − 0.0044993 × ob
       + 0.011774  × fb
       + 0.00027581 × ob²
       − 0.0012717  × fb²
       − 0.0000072800 × ob³
       + 0.0000063293 × fb³
```

**Méthode Terrill linéaire (alternative) :**

```
ob = OB / WCF ; fb = FB / WCF
FGtrue = 1.0000 − 0.0044993 × ob + 0.0117741 × fb
```

> Implémenter Terrill **cubique par défaut**, exposer le choix `cubic | linear | simple`.

### 7.4 Interface attendue

```ts
refractoFgCorrected(
  originalBrix: number,
  finalBrix: number,
  wcf = 1.04,
  method: 'terrill_cubic' | 'terrill_linear' | 'simple' = 'terrill_cubic'
): number   // renvoie SG (ex. 1.011)
```

**Validation Terrill cubique** : OB 12,0 °Bx / FB 6,5 °Bx / WCF 1.04 → FG ≈ **0.999** (tolérance ±0,002) — bière très sèche, cohérent avec FB 6,5. *(Corrigé cf. bug #43 : l'ancienne valeur ≈1.010 provenait en fait de l'équation « standard » simple, qui donne ≈1.011 pour ces mêmes entrées.)*

---

## 8. Carbonatation

### 8.1 Sucre de refermentation (priming — bouteille)

```
gSucre = volumeBièreL × ( CO2cible − CO2résiduel ) × 3.9      // saccharose
```

CO₂ résiduel selon la **température la plus haute** atteinte par la bière après fermentation (T en °C) :

```
CO2résiduel (vol) = 3.0378
                  − 0.050062 × Tf
                  + 0.00026555 × Tf²        // Tf en °F
```

Facteur sucre selon le type :

| Sucre | Facteur (× saccharose) |
|---|---|
| Saccharose (table) | 1.00 → constante 3.9 g/L/vol |
| Dextrose (glucose monohydraté) | ≈ 1.10 (≈ 4.3 g/L/vol) |
| DME (extrait sec) | ≈ 1.47 (≈ 5.7 g/L/vol) |

```
gSucre_type = gSucre_saccharose × facteur
```

### 8.2 Carbonatation forcée (keg — pression régulateur)

Loi de Henry. Pression à régler (PSI) pour atteindre `volCO2` à température `Tf` (°F) :

```
PSI = −16.6999
    − 0.0101059 × Tf
    + 0.00116512 × Tf²
    + 0.173354   × Tf × volCO2
    + 4.24267    × volCO2
    − 0.0684226  × volCO2²
```

Correction altitude : `+0.5 PSI` par tranche de 1000 ft au-dessus du niveau de la mer (≈ +0.531 PSI précis).

> Sortie en PSI (standard kegging). Convertir en bar à l'affichage selon préférence (`bar = PSI × 0.0689476`).

### 8.3 Volumes de CO₂ par style (table de référence indicative)

| Style | Volumes CO₂ |
|---|---|
| British / Real ale | 1.5 – 2.0 |
| Porter / Stout | 1.7 – 2.3 |
| Lager / Pils | 2.2 – 2.7 |
| Pale Ale / IPA | 2.2 – 2.7 |
| Belge | 2.4 – 3.0 |
| Weizen / Hefeweizen | 3.3 – 4.5 |

### 8.4 Interfaces attendues

```ts
primingSugar(volumeL: number, co2Target: number, maxTempC: number,
             sugar: 'sucrose'|'dextrose'|'dme' = 'sucrose'): number   // grammes

kegPressurePsi(co2Target: number, tempC: number, altitudeFt = 0): number
```

**Validation** : 5 °C (41 °F), 2,4 vol → ≈ **11 PSI**. 19 L à 2,4 vol, refroidi à 4 °C → priming saccharose ≈ **100–110 g**.

---

## 9. Rendement & post-mortem brassin

### 9.1 Rendement réel (après mesure OG réelle)

```
pointsThéoriques = Σ points(potentialSg_i) × massKg_i      // à 100 %
pointsObtenus    = OG_points_mesuré × batchVolumeL
rendementRéel(%) = 100 × pointsObtenus / pointsThéoriques
```

### 9.2 Atténuation réelle (après FG mesurée)

```
atténRéelle(%) = 100 × (OG_points_mesuré − FG_points_mesuré) / OG_points_mesuré
```

### 9.3 Ajustement de volume / dilution (densité après ajout d'eau)

```
SG2 = 1 + ( points(SG1) × V1 / V2 ) / 1000
```

### 9.4 Blending (mélange de deux moûts/bières)

```
pointsMix = ( points(SG_a) × V_a + points(SG_b) × V_b ) / (V_a + V_b)
SG_mix    = 1 + pointsMix / 1000
```

---

## 10. Calculs houblon avancés (optionnel v2)

### 10.1 HBU (Homebrew Bittering Units)

```
HBU = Σ ( alphaPct_i × onces_i )      // unités impériales
```

### 10.2 Indice de garde / vieillissement houblon (Hop Storage Index)

```
alphaRestant(%) = 100 × e^( −k × HSI × mois )
```

(facultatif — pertinent seulement si suivi de stock houblon avec vieillissement.)

---

## 11. Récapitulatif des interfaces du package `core`

```ts
// densités
calcOg(fermentables, efficiencyPct, batchVolumeL): number
calcFg(ogPoints, attenuationPct): number
boilGravity(ogPoints, batchVolumeL, boilVolumeL): number

// alcool
calcAbv(og, fg, method?): number
calcAbw(abv, fg): number

// amertume
calcIbu(additions, boilGravity, batchVolumeL, method?): number

// couleur
calcColorEbc(fermentables, batchVolumeL): number
ebcToHex(ebc): string

// empâtage
strikeWaterTemp(ratio, targetC, grainC): number
mashWaterVolume(grainKg, ratio): number
spargeVolume(...): number

// mesures
hydrometerTempCorrect(sgRead, readC, calC): number
refractoOgFromBrix(brix, wcf?): number
refractoFgCorrected(ob, fb, wcf?, method?): number

// carbonatation
primingSugar(volumeL, co2Target, maxTempC, sugar?): number
kegPressurePsi(co2Target, tempC, altitudeFt?): number
residualCo2(tempC): number

// post-mortem
realEfficiency(...): number
realAttenuation(ogMeasured, fgMeasured): number
dilute(sg1, v1, v2): number
blend(sgA, vA, sgB, vB): number

// conversions (units.ts)
gToKg, gToLb, lToGal, cToF, fToC, sgToPlato, platoToSg,
srmToEbc, ebcToSrm, psiToBar, barToPsi
```

---

## Annexe A — `ebcToHex` (interpolation)

Points d'ancrage (EBC → hex), interpoler linéairement en RGB entre deux ancres :

| EBC | Hex |
|---|---|
| 2 | `#FBE68B` |
| 4 | `#F3CA00` |
| 8 | `#E08A00` |
| 12 | `#D07000` |
| 16 | `#C05000` |
| 20 | `#A23E00` |
| 30 | `#8A2A00` |
| 40 | `#651900` |
| 50 | `#4A1500` |
| 60 | `#360E00` |
| 80+ | `#1A0A00` |

---

## Annexe B — Constantes de référence (à figer en tête de `core`)

```ts
export const WCF_DEFAULT = 1.04;          // wort correction factor réfractomètre
export const ABV_FACTOR  = 131.25;        // ABV standard
export const PRIMING_SUCROSE = 3.9;       // g/L par volume de CO2
export const MASH_HEAT_RATIO = 0.41;      // strike water
export const DEFAULT_EFFICIENCY = 72;     // %
export const DEFAULT_MASH_RATIO = 3.0;    // L/kg
export const GRAIN_ABSORPTION = 1.0;      // L/kg retenu par la drêche
```

---

## Annexe C — Sources des formules

- **OG/FG/ABV** : conventions standard du brassage amateur (formule ABV 131,25).
- **IBU Tinseth** : modèle de Glenn Tinseth ; **Rager** : modèle de Jackie Rager.
- **Couleur** : équation de Dan Morey (MCU → SRM).
- **Réfractomètre** : facteur de correction moût ~1.04 ; correction post-fermentation par la **régression cubique de Sean Terrill**, considérée comme la plus précise par la communauté.
- **Carbonatation forcée** : régression pression/température/volumes CO₂ (loi de Henry) ; volumes par style selon tables grand public.

> Le développeur doit **valider chaque formule contre au moins une recette documentée** avant de la considérer comme acquise (cf. exigence de tests du plan technique, §8).

---

*Fin du référentiel. Toutes les valeurs de validation citées sont des ordres de grandeur de contrôle, à confirmer par les tests unitaires.*

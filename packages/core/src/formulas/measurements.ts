/**
 * Mesures — correction densimètre en température & correction réfractomètre.
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` §7. En cas de divergence code ↔
 * document, le document fait foi (CLAUDE.md).
 *
 * Utilisé aux mesures Jour J et au journal de fermentation. Fonctions pures
 * (ADR-03). Densités en SG brute, températures en °C, Brix en °Bx.
 *
 * Les coefficients ci-dessous sont des **régressions** transcrites du référentiel
 * (§7.1 densimètre, §7.3 réfractomètre) — ce ne sont pas des constantes métier
 * réglables mais la formule elle-même ; ils sont donc inlinés avec citation.
 *
 * NB (bug #43) : la formule « simple » du doc a été corrigée (l'ancienne renvoyait
 * ~6.76, pas une SG) → équation « standard » grand public. La validation Terrill
 * cubique du doc a aussi été corrigée (≈1.010 → ≈0.999 pour OB 12 / FB 6,5).
 */

import { brixToPlato, cToF, platoToSg, WCF_DEFAULT } from "../units.js";

/** Température de calibration usuelle des densimètres (°C). */
export const HYDROMETER_CALIBRATION_C = 20;

/** Méthode de correction FG au réfractomètre après fermentation (§7.3/§7.4). */
export type RefractoMethod = "terrill_cubic" | "terrill_linear" | "simple";

/**
 * Facteur de correction densimètre en température (§7.1), régression pour `T` en °F,
 * calibration 20 °C : `1.00130346 − 1.347e−4·T + 2.041e−6·T² − 2.328e−9·T³`.
 */
function tempCorrectionFactor(tempF: number): number {
  return (
    1.00130346 - 1.34722124e-4 * tempF + 2.04052596e-6 * tempF ** 2 - 2.32820948e-9 * tempF ** 3
  );
}

/**
 * Densité corrigée de la température de lecture (§7.1).
 *
 * `SGcorrigé = SGlu × correction(Tlecture) / correction(Tcalibration)`.
 *
 * @param sgRead densité lue (SG brute).
 * @param readC  température de lecture (°C).
 * @param calC   température de calibration du densimètre (°C) ; défaut 20 °C.
 * @returns densité corrigée (SG brute).
 */
export function hydrometerTempCorrect(
  sgRead: number,
  readC: number,
  calC: number = HYDROMETER_CALIBRATION_C,
): number {
  return (sgRead * tempCorrectionFactor(cToF(readC))) / tempCorrectionFactor(cToF(calC));
}

/**
 * OG depuis une lecture réfractomètre de moût non fermenté (§7.2).
 *
 * `BrixRéel = BrixLu / WCF`, `Brix ≈ Plato`, `SG = platoToSg(BrixRéel)`.
 *
 * @param brix lecture réfractomètre (°Bx WRI).
 * @param wcf  wort correction factor propre à l'instrument ; défaut 1.04.
 * @returns OG en SG brute.
 * @throws RangeError si `wcf ≤ 0` (division interdite).
 */
export function refractoOgFromBrix(brix: number, wcf: number = WCF_DEFAULT): number {
  if (!(wcf > 0)) {
    throw new RangeError(
      `refractoOgFromBrix: wcf doit être > 0 (reçu ${wcf}) — division interdite.`,
    );
  }
  return platoToSg(brixToPlato(brix / wcf));
}

/**
 * FG corrigée de l'alcool depuis deux lectures réfractomètre (§7.3/§7.4).
 *
 * Requiert le Brix initial (OB) et le Brix final (FB), tous deux au réfractomètre.
 * Toutes les méthodes appliquent d'abord le WCF (`ob = OB/WCF`, `fb = FB/WCF`) :
 * - `terrill_cubic` (défaut, la plus précise) ;
 * - `terrill_linear` (alternative) ;
 * - `simple` : équation « standard » grand public (cf. bug #43).
 *
 * @param originalBrix Brix initial OB (°Bx).
 * @param finalBrix    Brix final FB (°Bx).
 * @param wcf          wort correction factor ; défaut 1.04.
 * @param method       méthode de correction ; défaut `terrill_cubic`.
 * @returns FG en SG brute (ex. 1.011).
 * @throws RangeError si `wcf ≤ 0` (division interdite).
 */
export function refractoFgCorrected(
  originalBrix: number,
  finalBrix: number,
  wcf: number = WCF_DEFAULT,
  method: RefractoMethod = "terrill_cubic",
): number {
  if (!(wcf > 0)) {
    throw new RangeError(
      `refractoFgCorrected: wcf doit être > 0 (reçu ${wcf}) — division interdite.`,
    );
  }

  const ob = originalBrix / wcf;
  const fb = finalBrix / wcf;

  switch (method) {
    case "terrill_linear":
      return 1.0 - 0.0044993 * ob + 0.0117741 * fb;
    case "simple":
      return (
        1.001843 -
        0.002318474 * ob -
        0.000007775 * ob ** 2 -
        0.000000034 * ob ** 3 +
        0.00574 * fb +
        0.00003344 * fb ** 2 +
        0.000000086 * fb ** 3
      );
    case "terrill_cubic":
      return (
        1.0 -
        0.0044993 * ob +
        0.011774 * fb +
        0.00027581 * ob ** 2 -
        0.0012717 * fb ** 2 -
        0.00000728 * ob ** 3 +
        0.0000063293 * fb ** 3
      );
  }
}

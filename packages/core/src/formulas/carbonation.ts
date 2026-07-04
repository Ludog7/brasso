/**
 * Carbonatation — CO₂ résiduel, sucre de refermentation (priming), pression keg.
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` §8. En cas de divergence code ↔
 * document, le document fait foi (CLAUDE.md).
 *
 * Sert au conditionnement (bière) et au garde-fou surpression des boissons ALT
 * (moteur M1-12). Fonctions pures (ADR-03). Températures en °C, volumes en L,
 * masses en g, pression en PSI (conversion bar via `psiToBar` de units.ts).
 *
 * Les régressions §8.1/§8.2 (T en °F) sont inlinées avec citation — elles
 * constituent la formule, pas des constantes métier réglables.
 */

import { cToF, PRIMING_SUCROSE } from "../units.js";

/** Type de sucre de refermentation (§8.1). */
export type PrimingSugar = "sucrose" | "dextrose" | "dme";

/** Facteurs de sucre relatifs au saccharose (§8.1). */
export const SUGAR_FACTORS: Record<PrimingSugar, number> = {
  sucrose: 1.0,
  dextrose: 1.1,
  dme: 1.47,
};

/** Correction d'altitude de la pression keg (§8.2) : +0.5 PSI par 1000 ft. */
export const ALTITUDE_PSI_PER_1000FT = 0.5;

/**
 * CO₂ résiduel d'une bière selon la température la plus haute atteinte (§8.1).
 *
 * `CO2résiduel (vol) = 3.0378 − 0.050062×Tf + 0.00026555×Tf²` (Tf en °F).
 *
 * @param tempC température la plus haute atteinte après fermentation (°C).
 * @returns CO₂ résiduel en volumes.
 */
export function residualCo2(tempC: number): number {
  const tf = cToF(tempC);
  return 3.0378 - 0.050062 * tf + 0.00026555 * tf ** 2;
}

/**
 * Sucre de refermentation en bouteille (priming, g) — FORMULES §8.1.
 *
 * `gSucre = volumeL × (CO2cible − CO2résiduel) × 3.9 × facteur_sucre`. Le CO₂
 * résiduel dépend de la température **la plus haute** atteinte (`maxTempC`), pas
 * de la température de service.
 *
 * @param volumeL   volume de bière à embouteiller (L).
 * @param co2Target CO₂ cible (volumes).
 * @param maxTempC  température la plus haute atteinte après fermentation (°C).
 * @param sugar     type de sucre (§8.1) ; défaut `sucrose`.
 * @returns masse de sucre (g).
 */
export function primingSugar(
  volumeL: number,
  co2Target: number,
  maxTempC: number,
  sugar: PrimingSugar = "sucrose",
): number {
  const sucroseGrams = volumeL * (co2Target - residualCo2(maxTempC)) * PRIMING_SUCROSE;
  return sucroseGrams * SUGAR_FACTORS[sugar];
}

/**
 * Pression de carbonatation forcée au keg (PSI) — FORMULES §8.2.
 *
 * Régression pression/température/volumes (loi de Henry) + correction d'altitude
 * (+0.5 PSI / 1000 ft).
 *
 * @param co2Target  CO₂ cible (volumes).
 * @param tempC      température de la bière (°C).
 * @param altitudeFt altitude au-dessus du niveau de la mer (ft) ; défaut 0.
 * @returns pression régulateur (PSI).
 */
export function kegPressurePsi(co2Target: number, tempC: number, altitudeFt = 0): number {
  const tf = cToF(tempC);
  const psi =
    -16.6999 -
    0.0101059 * tf +
    0.00116512 * tf ** 2 +
    0.173354 * tf * co2Target +
    4.24267 * co2Target -
    0.0684226 * co2Target ** 2;
  return psi + (altitudeFt / 1000) * ALTITUDE_PSI_PER_1000FT;
}

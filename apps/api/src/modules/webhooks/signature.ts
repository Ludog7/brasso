/**
 * Vérification de signature des webhooks (M6-07) — **abstraction générique par
 * provider** (décision de cadrage M6-00), défaut **HMAC-SHA256**. Le secret vit
 * uniquement en variable d'environnement (§6) ; la signature EST l'authentification
 * de la route publique. Réutilisé par M7 (SumUp/Zettle).
 *
 * Stratégie par défaut : `hex(hmac_sha256(secret, rawBody))` comparé en **temps
 * constant** à l'en-tête `x-webhook-signature`. La comparaison porte sur les
 * **octets exacts** reçus (d'où le raw body), jamais sur le JSON re-sérialisé.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import type { ExternalProviderKind } from "@brasso/db";

/** En-tête portant la signature (générique, tous providers). */
export const SIGNATURE_HEADER = "x-webhook-signature";

/** Entrée d'une stratégie de vérification. */
export interface SignatureInput {
  secret: string;
  rawBody: Buffer;
  headers: IncomingHttpHeaders;
}

/** Une stratégie de vérification renvoie `true` ssi la signature est valide. */
export type SignatureStrategy = (input: SignatureInput) => boolean;

/** Compare deux chaînes en temps constant (garde-fou longueur avant timingSafeEqual). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Stratégie HMAC-SHA256 : en-tête = hex du HMAC du corps brut par le secret. */
const hmacSha256Strategy: SignatureStrategy = ({ secret, rawBody, headers }) => {
  const provided = headers[SIGNATURE_HEADER];
  if (typeof provided !== "string" || provided.length === 0) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(provided.trim(), expected);
};

/**
 * Stratégies par `ExternalProviderKind`. Toutes adossées à HMAC-SHA256 par défaut
 * (le schéma réel de chaque provider se branchera ici sans toucher aux appelants).
 */
const STRATEGIES: Record<ExternalProviderKind, SignatureStrategy> = {
  HELLOASSO: hmacSha256Strategy,
  SUMUP: hmacSha256Strategy,
  ZETTLE: hmacSha256Strategy,
};

/** Vérifie la signature d'un webhook selon la stratégie du provider. */
export function verifyWebhookSignature(kind: ExternalProviderKind, input: SignatureInput): boolean {
  return (STRATEGIES[kind] ?? hmacSha256Strategy)(input);
}

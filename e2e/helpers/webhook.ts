/**
 * Helper d'émission de **webhooks signés** (M8-06). Les webhooks sont des appels
 * **serveur-à-serveur** (hors proxy web) : on poste directement sur l'API
 * (`API_BASE`). La signature est le socle générique **HMAC-SHA256** (M6-07) :
 * en-tête `x-webhook-signature` = `hex(hmac_sha256(secret, corps_brut))`, comparé
 * aux **octets exacts** reçus → on signe et on envoie **la même chaîne** (`data`
 * string, jamais un objet re-sérialisé par le client).
 */

import { createHmac } from "node:crypto";

import type { APIRequestContext, APIResponse } from "@playwright/test";

import { API_BASE, WEBHOOK_SECRETS } from "../fixtures/env.js";

const SIGNATURE_HEADER = "x-webhook-signature";

/** Signature HMAC-SHA256 (hex) du corps brut, attendue par l'API. */
function sign(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** POST bas niveau : corps **brut** + éventuelle signature (null = non signé). */
function postRaw(
  request: APIRequestContext,
  path: string,
  rawBody: string,
  signature: string | null,
): Promise<APIResponse> {
  return request.post(`${API_BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(signature !== null ? { [SIGNATURE_HEADER]: signature } : {}),
    },
    data: rawBody,
  });
}

/** Vente SumUp (montant en euros décimaux, réf. produit = `transaction.products[0].id`). */
export function sumUpSalePayload(args: {
  transactionId: string;
  externalProductId: string;
  amountEuros?: number;
}): Record<string, unknown> {
  return {
    event_type: "transaction.updated",
    transaction: {
      id: args.transactionId,
      amount: args.amountEuros ?? 4.5,
      currency: "EUR",
      timestamp: new Date().toISOString(),
      payment_type: "POS",
      products: [{ id: args.externalProductId, name: "Vente E2E" }],
    },
  };
}

/** Cotisation HelloAsso (`data.payer.email` = clé de rapprochement membre). */
export function helloAssoContributionPayload(args: {
  orderId: number;
  payerEmail: string;
}): Record<string, unknown> {
  return {
    eventType: "Order",
    data: {
      id: args.orderId,
      amount: { total: 2500, currency: "EUR" },
      date: new Date().toISOString(),
      paymentMeans: "Card",
      payer: { email: args.payerEmail, firstName: "Ada", lastName: "Lovelace" },
    },
  };
}

/** Poste un webhook **correctement signé** avec le secret du provider. */
export function postSignedWebhook(
  request: APIRequestContext,
  path: string,
  secret: string,
  payload: Record<string, unknown>,
): Promise<APIResponse> {
  const raw = JSON.stringify(payload);
  return postRaw(request, path, raw, sign(secret, raw));
}

/** Vente SumUp signée → `/webhooks/sumup`. */
export function postSumUpSale(
  request: APIRequestContext,
  args: { transactionId: string; externalProductId: string; amountEuros?: number },
): Promise<APIResponse> {
  return postSignedWebhook(
    request,
    "/webhooks/sumup",
    WEBHOOK_SECRETS.SUMUP,
    sumUpSalePayload(args),
  );
}

/** Cotisation HelloAsso signée → `/webhooks/helloasso`. */
export function postHelloAssoContribution(
  request: APIRequestContext,
  args: { orderId: number; payerEmail: string },
): Promise<APIResponse> {
  return postSignedWebhook(
    request,
    "/webhooks/helloasso",
    WEBHOOK_SECRETS.HELLOASSO,
    helloAssoContributionPayload(args),
  );
}

/** Poste un webhook avec une **signature invalide** (doit être rejeté en 401). */
export function postWithBadSignature(
  request: APIRequestContext,
  path: string,
  payload: Record<string, unknown>,
): Promise<APIResponse> {
  return postRaw(request, path, JSON.stringify(payload), "signature-invalide-e2e");
}

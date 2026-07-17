import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { IntegrationAlert } from "@/lib/api";
import { useSession } from "@/stores/session";

let userRoles = ["caisse"];
const USER = () => ({ id: "u1", email: "u@brasso.test", displayName: "Test", roles: userRoles });

let alerts: IntegrationAlert[] = [];
let calls: { method: string; url: string; path: string; body: unknown }[] = [];

function makeAlert(over: Partial<IntegrationAlert> & { id: string }): IntegrationAlert {
  return {
    type: "UNMAPPED_TRANSACTION",
    status: "OPEN",
    message: "Vente non rapprochée (produit SUMUP-PROD-BLONDE)",
    providerId: "p-sumup",
    provider: { label: "SumUp" },
    transactionId: "sale-1",
    transaction: {
      amountCents: 450,
      currency: "EUR",
      occurredAt: "2026-07-16T12:00:00Z",
      externalProductId: "SUMUP-PROD-BLONDE",
    },
    createdAt: "2026-07-16T12:00:05Z",
    resolvedAt: null,
    ...over,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch() {
  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const path = url.split("?")[0] ?? url;
    const query = new URL(url, "http://localhost").searchParams;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, path, body });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER() }));

    if (path.endsWith("/api/catalog-items") && method === "GET") {
      return Promise.resolve(
        json(200, {
          items: [
            { id: "cat-blonde", name: "Blonde 33cl", kind: "CONDITIONNEMENT" },
            { id: "cat-ipa", name: "IPA 33cl", kind: "CONDITIONNEMENT" },
          ],
        }),
      );
    }

    if (path.endsWith("/api/alerts") && method === "GET") {
      const status = query.get("status");
      const type = query.get("type");
      let filtered = alerts;
      if (status) filtered = filtered.filter((a) => a.status === status);
      if (type) filtered = filtered.filter((a) => a.type === type);
      return Promise.resolve(json(200, { alerts: filtered, total: filtered.length }));
    }

    const resolveMatch = /\/api\/alerts\/([^/]+)\/resolve$/.exec(path);
    if (resolveMatch && method === "POST") {
      const id = resolveMatch[1]!;
      const idx = alerts.findIndex((a) => a.id === id);
      if (idx >= 0) {
        alerts[idx] = {
          ...alerts[idx],
          status: "RESOLVED",
          resolvedAt: "2026-07-16T13:00:00Z",
        } as IntegrationAlert;
        return Promise.resolve(json(200, { alert: alerts[idx] }));
      }
    }

    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp(initial = "/alerts") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  userRoles = ["caisse"];
  alerts = [
    makeAlert({ id: "al-unmapped", type: "UNMAPPED_TRANSACTION", status: "OPEN" }),
    makeAlert({
      id: "al-webhook",
      type: "WEBHOOK_FAILURE",
      status: "OPEN",
      message: "Échec d'ingestion du webhook",
      transactionId: null,
      transaction: null,
    }),
    makeAlert({
      id: "al-done",
      type: "UNMAPPED_TRANSACTION",
      status: "RESOLVED",
      resolvedAt: "2026-07-15T10:00:00Z",
    }),
  ];
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dashboard anomalies — liste & filtres (M7-10)", () => {
  it("liste les anomalies ouvertes par défaut avec badge de type", async () => {
    installFetch();
    renderApp();

    // Par défaut : status=OPEN → les deux anomalies ouvertes, pas la résolue.
    // Ancre sur l'en-tête (les libellés de badge existent aussi comme <option> de filtre).
    const table = (await screen.findByText("Détail")).closest("table")!;
    expect(within(table).getByText("Vente non rapprochée")).toBeInTheDocument();
    expect(within(table).getByText("Échec webhook")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "GET" && c.url.includes("status=OPEN"))).toBe(true);
  });

  it("filtre sur les anomalies résolues (GET status=RESOLVED)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await screen.findByText(/échec d'ingestion du webhook/i);
    await user.selectOptions(screen.getByLabelText("Statut"), "RESOLVED");

    await waitFor(() =>
      expect(calls.some((c) => c.method === "GET" && c.url.includes("status=RESOLVED"))).toBe(true),
    );
    // La liste résolue contient l'anomalie clôturée, avec badge « Résolue ».
    const table = await screen.findByText("Détail");
    expect(within(table.closest("table")!).getAllByText("Résolue").length).toBeGreaterThanOrEqual(
      1,
    );
  });
});

describe("dashboard anomalies — résolution (M7-10)", () => {
  it("résout une anomalie sans ajustement (POST corps vide)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const row = (await screen.findByText(/échec d'ingestion du webhook/i)).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: /résoudre/i }));

    // Dialogue ouvert : résoudre directement.
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /résoudre/i }));

    await waitFor(() => {
      const post = calls.find((c) => /\/api\/alerts\/al-webhook\/resolve$/.test(c.path));
      expect(post).toBeDefined();
      expect(post?.body).toEqual({});
    });
  });

  it("résout une anomalie avec ajustement de stock manuel (POST stockAdjustment)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const table = (await screen.findByText("Détail")).closest("table")!;
    const row = within(table).getByText("Vente non rapprochée").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: /résoudre/i }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: /ajuster le stock/i }));
    await user.selectOptions(within(dialog).getByLabelText("Article"), "cat-blonde");
    await user.type(within(dialog).getByLabelText(/quantité/i), "-1");
    await user.click(within(dialog).getByRole("button", { name: /résoudre/i }));

    await waitFor(() => {
      const post = calls.find((c) => /\/api\/alerts\/al-unmapped\/resolve$/.test(c.path));
      expect(post?.body).toEqual({
        stockAdjustment: { catalogItemId: "cat-blonde", delta: -1 },
      });
    });
  });
});

describe("dashboard anomalies — compteur & RBAC UI (M7-10)", () => {
  it("affiche le compteur d'anomalies ouvertes dans la navigation (accueil)", async () => {
    installFetch();
    renderApp("/");

    // Deux anomalies ouvertes → badge « 2 » sur l'entrée Anomalies.
    expect(await screen.findByLabelText(/2 anomalie\(s\) ouverte\(s\)/i)).toBeInTheDocument();
  });

  it("brasseur : lecture seule — pas de bouton « Résoudre »", async () => {
    userRoles = ["brasseur"];
    installFetch();
    renderApp();

    // Message unique (≠ libellé de badge/option) comme ancre de chargement.
    expect(await screen.findByText(/échec d'ingestion du webhook/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /résoudre/i })).not.toBeInTheDocument();
  });

  it("rgpd : écran masqué (accès refusé) et aucune requête anomalies", async () => {
    userRoles = ["rgpd"];
    installFetch();
    renderApp();

    expect(await screen.findByText(/accès réservé aux rôles habilités/i)).toBeInTheDocument();
    expect(screen.queryByText(/vente non rapprochée/i)).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/api/alerts"))).toBe(false);
  });
});

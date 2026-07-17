import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { ExternalTransaction, SkuMapping } from "@/lib/api";
import { useSession } from "@/stores/session";

let userRoles = ["caisse"];
const USER = () => ({ id: "u1", email: "u@brasso.test", displayName: "Test", roles: userRoles });

let mappings: SkuMapping[] = [];
let transactions: ExternalTransaction[] = [];
let calls: { method: string; url: string; path: string; body: unknown }[] = [];

function makeMapping(over: Partial<SkuMapping> & { id: string; internalSku: string }): SkuMapping {
  const now = new Date("2026-07-16T10:00:00Z").toISOString();
  return {
    catalogItemId: "cat-blonde",
    catalogItem: { id: "cat-blonde", name: "Blonde 33cl", kind: "CONDITIONNEMENT" },
    providerId: "p-sumup",
    externalProductId: "SUMUP-PROD-BLONDE",
    externalCategory: "Bières",
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function makeTx(over: Partial<ExternalTransaction> & { id: string }): ExternalTransaction {
  return {
    providerId: "p-sumup",
    externalId: over.id,
    kind: "SALE",
    amountCents: 450,
    currency: "EUR",
    paymentMethod: "POS",
    externalProductId: "SUMUP-PROD-BLONDE",
    status: "UNMAPPED",
    memberId: null,
    hasRawPayload: true,
    occurredAt: "2026-07-16T12:00:00Z",
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

    // Mappings — liste / création.
    if (path.endsWith("/api/mappings") && method === "GET") {
      return Promise.resolve(json(200, { mappings, total: mappings.length }));
    }
    if (path.endsWith("/api/mappings") && method === "POST") {
      // Unicité (providerId, externalProductId) et internalSku → 409.
      const conflict = mappings.some(
        (m) =>
          (m.providerId === body.providerId && m.externalProductId === body.externalProductId) ||
          m.internalSku === body.internalSku,
      );
      if (conflict) {
        return Promise.resolve(
          json(409, { error: { code: "MAPPING_CONFLICT", message: "conflit" } }),
        );
      }
      const created = makeMapping({
        id: `map${mappings.length + 1}`,
        internalSku: body.internalSku,
        providerId: body.providerId,
        externalProductId: body.externalProductId,
        externalCategory: body.externalCategory ?? null,
        catalogItemId: body.catalogItemId ?? null,
        catalogItem: body.catalogItemId
          ? { id: body.catalogItemId, name: "Blonde 33cl", kind: "CONDITIONNEMENT" }
          : null,
      });
      mappings.push(created);
      return Promise.resolve(json(201, { mapping: created }));
    }

    const mappingIdMatch = /\/api\/mappings\/([^/]+)$/.exec(path);
    if (mappingIdMatch) {
      const id = mappingIdMatch[1]!;
      if (method === "PATCH") {
        const idx = mappings.findIndex((m) => m.id === id);
        if (idx >= 0) {
          mappings[idx] = { ...mappings[idx], ...body } as SkuMapping;
          return Promise.resolve(json(200, { mapping: mappings[idx] }));
        }
      }
      if (method === "DELETE") {
        mappings = mappings.filter((m) => m.id !== id);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
    }

    // Transactions — lecture seule filtrable.
    if (path.endsWith("/api/transactions") && method === "GET") {
      const status = query.get("status");
      const kind = query.get("kind");
      let filtered = transactions;
      if (status) filtered = filtered.filter((t) => t.status === status);
      if (kind) filtered = filtered.filter((t) => t.kind === kind);
      return Promise.resolve(json(200, { transactions: filtered, total: filtered.length }));
    }

    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/cash"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  userRoles = ["caisse"];
  mappings = [
    makeMapping({ id: "map1", internalSku: "SKU-BLD-33" }),
    makeMapping({
      id: "map2",
      internalSku: "SKU-IPA-33",
      externalProductId: "SUMUP-PROD-IPA",
      catalogItemId: null,
      catalogItem: null,
    }),
  ];
  transactions = [
    makeTx({ id: "sale-1", status: "UNMAPPED" }),
    makeTx({ id: "sale-2", status: "MAPPED" }),
    makeTx({ id: "memb-1", kind: "MEMBERSHIP", status: "IGNORED", externalProductId: null }),
  ];
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const txGetCount = () =>
  calls.filter((c) => c.method === "GET" && c.path.endsWith("/api/transactions")).length;

describe("caisse — mappings (M7-09)", () => {
  it("liste les mappings ; un mapping sans article lié est signalé « Non lié »", async () => {
    installFetch();
    renderApp();

    expect(await screen.findByText("SKU-BLD-33")).toBeInTheDocument();
    const ipaRow = screen.getByText("SKU-IPA-33").closest("tr")!;
    expect(within(ipaRow).getByText("Non lié")).toBeInTheDocument();
    const blondeRow = screen.getByText("SKU-BLD-33").closest("tr")!;
    expect(within(blondeRow).getByText("Blonde 33cl")).toBeInTheDocument();
  });

  it("crée un mapping (POST) avec article de catalogue lié", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /nouveau mapping/i }));
    await user.type(screen.getByLabelText("SKU interne"), "SKU-NEW");
    await user.type(screen.getByLabelText("Fournisseur"), "p-zettle");
    await user.type(screen.getByLabelText("Produit externe"), "ZP-NEW");
    await user.selectOptions(screen.getByLabelText("Article de catalogue lié"), "cat-ipa");
    await user.click(screen.getByRole("button", { name: /créer le mapping/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/api/mappings"));
      expect(post?.body).toMatchObject({
        internalSku: "SKU-NEW",
        providerId: "p-zettle",
        externalProductId: "ZP-NEW",
        catalogItemId: "cat-ipa",
      });
    });
  });

  it("édite un mapping existant (PATCH)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const blondeRow = (await screen.findByText("SKU-BLD-33")).closest("tr")!;
    await user.click(within(blondeRow).getByRole("button", { name: /éditer/i }));

    const category = screen.getByLabelText("Catégorie externe");
    await user.clear(category);
    await user.type(category, "Bières artisanales");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === "PATCH" && /\/api\/mappings\//.test(c.path));
      expect(patch?.body).toMatchObject({ externalCategory: "Bières artisanales" });
    });
  });

  it("affiche un message clair sur conflit 409 (produit externe déjà mappé)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /nouveau mapping/i }));
    await user.type(screen.getByLabelText("SKU interne"), "SKU-DUP");
    await user.type(screen.getByLabelText("Fournisseur"), "p-sumup");
    await user.type(screen.getByLabelText("Produit externe"), "SUMUP-PROD-BLONDE"); // déjà mappé
    await user.click(screen.getByRole("button", { name: /créer le mapping/i }));

    expect(await screen.findByText(/déjà défini pour ce produit externe/i)).toBeInTheDocument();
    // Le mapping n'a pas été ajouté.
    expect(mappings).toHaveLength(2);
  });

  it("supprime un mapping (DELETE)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const ipaRow = (await screen.findByText("SKU-IPA-33")).closest("tr")!;
    await user.click(within(ipaRow).getByRole("button", { name: /supprimer/i }));

    await waitFor(() => {
      const del = calls.find((c) => c.method === "DELETE" && /\/api\/mappings\/map2$/.test(c.path));
      expect(del).toBeDefined();
    });
  });
});

describe("caisse — transactions (M7-09)", () => {
  it("liste les transactions avec badge de statut (rapprochée / à rapprocher / ignorée)", async () => {
    installFetch();
    renderApp();

    await screen.findByText("SKU-BLD-33"); // écran chargé
    // Scopé au tableau des transactions (sinon les <option> des filtres matchent aussi).
    const txTable = screen.getByText("Paiement").closest("table")!;
    expect(within(txTable).getAllByText("Vente").length).toBeGreaterThanOrEqual(2);
    expect(within(txTable).getByText("Cotisation")).toBeInTheDocument();
    expect(within(txTable).getAllByText("À rapprocher").length).toBeGreaterThanOrEqual(1);
    expect(within(txTable).getByText("Rapprochée")).toBeInTheDocument();
    expect(within(txTable).getByText("Ignorée")).toBeInTheDocument();
  });

  it("filtre les transactions par statut puis par nature (GET côté serveur)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("SKU-BLD-33");

    await user.selectOptions(screen.getByLabelText("Statut"), "UNMAPPED");
    await waitFor(() =>
      expect(calls.some((c) => c.method === "GET" && c.url.includes("status=UNMAPPED"))).toBe(true),
    );

    await user.selectOptions(screen.getByLabelText("Nature"), "SALE");
    await waitFor(() =>
      expect(calls.some((c) => c.method === "GET" && c.url.includes("kind=SALE"))).toBe(true),
    );
  });
});

describe("caisse — RBAC UI (M7-09)", () => {
  it("brasseur : lecture seule — pas d'action d'écriture de mapping", async () => {
    userRoles = ["brasseur"];
    installFetch();
    renderApp();

    // Les mappings et transactions restent visibles…
    expect(await screen.findByText("SKU-BLD-33")).toBeInTheDocument();
    const txTable = screen.getByText("Paiement").closest("table")!;
    expect(within(txTable).getByText("Cotisation")).toBeInTheDocument();
    // …mais aucune action d'écriture.
    expect(screen.queryByRole("button", { name: /nouveau mapping/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /éditer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /supprimer/i })).not.toBeInTheDocument();
  });

  it("rgpd : écran masqué (accès refusé) et aucune requête caisse", async () => {
    userRoles = ["rgpd"];
    installFetch();
    renderApp();

    expect(await screen.findByText(/accès réservé aux rôles habilités/i)).toBeInTheDocument();
    expect(screen.queryByText("SKU-BLD-33")).not.toBeInTheDocument();
    expect(txGetCount()).toBe(0);
    expect(calls.some((c) => c.path.endsWith("/api/mappings"))).toBe(false);
  });
});

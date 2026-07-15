import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { useStockToasts } from "@/features/stock/toast";
import type { StockItem } from "@/lib/api";
import { useSession } from "@/stores/session";

let userRoles = ["brasseur"];
const USER = () => ({
  id: "u1",
  email: "u@brasso.test",
  displayName: "Test",
  roles: userRoles,
});

let items: StockItem[] = [];
let calls: { method: string; url: string; path: string; body: unknown }[] = [];

function makeItem(over: Partial<StockItem> & { id: string; name: string }): StockItem {
  const now = new Date("2026-07-15T10:00:00Z").toISOString();
  return {
    kind: "RECETTE",
    category: "MALT",
    unit: "GRAM",
    attributes: null,
    defaultUnitCostCents: null,
    reorderThreshold: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    level: 0,
    reservedOutstanding: 0,
    available: 0,
    below: false,
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

    if (path.endsWith("/api/stock/items") && method === "GET") {
      const kind = query.get("kind");
      const filtered = kind ? items.filter((i) => i.kind === kind) : items;
      return Promise.resolve(json(200, { items: filtered }));
    }
    if (path.endsWith("/api/stock/alerts")) {
      const alerts = items
        .filter((i) => i.below)
        .map((i) => ({
          id: i.id,
          name: i.name,
          kind: i.kind,
          level: i.level,
          available: i.available,
          reorderThreshold: i.reorderThreshold ?? 0,
        }));
      return Promise.resolve(json(200, { items: alerts }));
    }
    if (path.endsWith("/api/stock/items") && method === "POST") {
      const created = makeItem({ id: `it${items.length + 1}`, ...body });
      items.push(created);
      return Promise.resolve(json(201, { item: created }));
    }
    if (path.endsWith("/api/stock/movements") && method === "POST") {
      const item = items.find((i) => i.id === body.catalogItemId);
      if (item) {
        item.level += body.delta;
        item.available += body.delta;
      }
      return Promise.resolve(json(201, { movement: { id: "mv" }, level: item?.level ?? 0 }));
    }
    if (path.endsWith("/api/stock/inventory") && method === "POST") {
      const lines = (body.counts as { catalogItemId: string; countedQuantity: number }[]).map(
        (c) => {
          const item = items.find((i) => i.id === c.catalogItemId);
          const previousLevel = item?.level ?? 0;
          const delta = c.countedQuantity - previousLevel;
          if (item) {
            item.level = c.countedQuantity;
            item.available += delta;
          }
          return { ...c, previousLevel, delta, movementId: delta !== 0 ? "mv" : undefined };
        },
      );
      return Promise.resolve(json(200, { lines }));
    }

    const patchId = /\/api\/stock\/items\/([^/]+)$/.exec(path)?.[1];
    if (patchId && method === "PATCH") {
      const idx = items.findIndex((i) => i.id === patchId);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...body } as StockItem;
        return Promise.resolve(json(200, { item: items[idx] }));
      }
    }

    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/stock"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const getItemsCalls = () =>
  calls.filter((c) => c.method === "GET" && c.path.endsWith("/api/stock/items")).length;

beforeEach(() => {
  userRoles = ["brasseur"];
  items = [
    makeItem({
      id: "malt",
      name: "Malt Pale",
      kind: "RECETTE",
      unit: "GRAM",
      level: 4000,
      reservedOutstanding: 3000,
      available: 1000,
      below: true,
      reorderThreshold: 1500,
      defaultUnitCostCents: 1,
    }),
    makeItem({
      id: "co2",
      name: "CO2",
      kind: "BULK",
      unit: "UNIT",
      level: 800,
      available: 800,
      below: false,
      reorderThreshold: 500,
    }),
  ];
  calls = [];
  useSession.setState({ user: null });
  useStockToasts.setState({ toasts: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("écran stock — liste & alertes (M5-07)", () => {
  it("affiche les niveaux et un badge « Stock bas » sur l'article sous seuil", async () => {
    installFetch();
    renderApp();

    expect(await screen.findByText("Malt Pale")).toBeInTheDocument();
    expect(screen.getByText("CO2")).toBeInTheDocument();
    // Niveau BULK (< 1000, sans séparateur : niveau + disponible) et badge d'alerte.
    expect(screen.getAllByText("800 u").length).toBeGreaterThan(0);
    expect(screen.getByText("Stock bas")).toBeInTheDocument();
    // Bandeau d'alertes agrégées.
    expect(screen.getByText(/sous le seuil de réappro/)).toBeInTheDocument();
  });

  it("rôle lecture seule (caisse) : aucune action d'écriture", async () => {
    userRoles = ["caisse"];
    installFetch();
    renderApp();

    expect(await screen.findByText("Malt Pale")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nouvel article/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^modifier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /inventaire/i })).not.toBeInTheDocument();
  });
});

describe("écran stock — écriture (M5-07)", () => {
  it("crée un article : coût en € converti en centimes", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /nouvel article/i }));
    await user.type(screen.getByLabelText("Nom"), "Sucre candi");
    await user.type(screen.getByLabelText(/coût de référence/i), "0,5");
    await user.click(screen.getByRole("button", { name: /créer l'article/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/api/stock/items"));
      expect(post?.body).toMatchObject({
        name: "Sucre candi",
        kind: "RECETTE",
        defaultUnitCostCents: 50,
      });
    });
  });

  it("édite un article : le type est verrouillé, le PATCH n'envoie pas de kind", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Modifier Malt Pale" }));
    expect(screen.getByLabelText("Type")).toBeDisabled();

    const name = screen.getByLabelText("Nom");
    await user.clear(name);
    await user.type(name, "Malt Pale v2");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === "PATCH");
      expect(patch?.body).toMatchObject({ name: "Malt Pale v2" });
      expect((patch?.body as { kind?: unknown }).kind).toBeUndefined();
    });
  });

  it("saisit un mouvement : POST correct et liste rafraîchie", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /^mouvement$/i }));
    await user.selectOptions(screen.getByLabelText("Article"), "malt");
    await user.type(screen.getByLabelText(/quantité/i), "500");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/mouvement enregistré/i);
    const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/api/stock/movements"));
    expect(post?.body).toMatchObject({ catalogItemId: "malt", delta: 500, reason: "PURCHASE" });
    // Invalidation → nouveau GET des articles.
    await waitFor(() => expect(getItemsCalls()).toBeGreaterThanOrEqual(2));
  });

  it("inventaire : affiche l'écart puis recale à la validation", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /inventaire/i }));
    // Malt niveau 4000, compté 3500 → écart −500.
    await user.type(screen.getByLabelText(/quantité comptée — Malt Pale/i), "3500");
    expect(screen.getByText("-500 g")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /valider l'inventaire/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/inventaire validé/i);
    const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/api/stock/inventory"));
    expect(post?.body).toMatchObject({
      counts: [{ catalogItemId: "malt", countedQuantity: 3500 }],
    });
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { DisplayRenderView } from "@/features/display/DisplayRenderView";
import type { DisplayRenderItem, DisplayTemplate, ScreenRender } from "@/lib/api";
import { useSession } from "@/stores/session";

// Vue d'affichage temps réel (M7-13) : rendu par template, sync au jeton, robustesse
// réseau. L'API filtre déjà les indisponibles (M7-08) : côté web on vérifie que la vue
// rend **exactement** les produits du rendu et se resynchronise au changement de jeton.

let userRoles = ["admin"];
const USER = () => ({ id: "u1", email: "u@brasso.test", displayName: "Test", roles: userRoles });

let current: ScreenRender;
let failRender = false;
let calls: string[] = [];

function renderItem(
  id: string,
  name: string,
  opts: {
    priceCents?: number | null;
    flags?: Partial<DisplayRenderItem["flags"]>;
    sortOrder?: number;
  } = {},
): DisplayRenderItem {
  return {
    catalogItemId: id,
    name,
    priceCents: opts.priceCents ?? null,
    flags: { isNew: false, isFavorite: false, isSpecial: false, ...opts.flags },
    sortOrder: opts.sortOrder ?? 0,
  };
}

function screenRender(over: {
  template?: DisplayTemplate;
  legalMentions?: string | null;
  items: DisplayRenderItem[];
  syncToken: string;
}): ScreenRender {
  return {
    screen: {
      id: "scr-1",
      name: "Écran bar",
      template: over.template ?? "CARDS",
      legalMentions: over.legalMentions ?? "L'abus d'alcool est dangereux pour la santé.",
      surface: { id: "srf-bar", name: "Bar" },
    },
    items: over.items,
    syncedAt: new Date("2026-07-17T10:00:00Z").toISOString(),
    syncToken: over.syncToken,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch() {
  const impl = vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const path = url.split("?")[0] ?? url;

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER() }));

    if (/\/api\/display\/screens\/[^/]+\/render$/.test(path)) {
      calls.push(path);
      if (failRender) return Promise.reject(new Error("network down"));
      return Promise.resolve(json(200, current));
    }

    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

const renderCalls = () => calls.filter((p) => p.endsWith("/render")).length;

/** Rendu direct de la vue (intervalle court pour observer le polling sans faux timers). */
function renderView(intervalMs = 40) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DisplayRenderView screenId="scr-1" intervalMs={intervalMs} />
    </QueryClientProvider>,
  );
}

/** Rendu via l'app (route plein écran + RBAC + bootstrap session). */
function renderApp(path = "/display/screen/scr-1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  userRoles = ["admin"];
  failRender = false;
  calls = [];
  current = screenRender({
    items: [
      renderItem("cat-blonde", "Blonde 33cl", { priceCents: 450, flags: { isNew: true } }),
      renderItem("cat-ipa", "IPA 33cl", { priceCents: 550, sortOrder: 1 }),
    ],
    syncToken: "t1",
  });
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vue d'affichage — rendu par template (M7-13)", () => {
  it.each(["LIST", "TABLE", "CARDS"] as const)(
    "template %s : nom, prix formaté et badge d'indicateur",
    async (template) => {
      current = screenRender({
        template,
        items: [
          renderItem("cat-blonde", "Blonde 33cl", { priceCents: 450, flags: { isNew: true } }),
        ],
        syncToken: "t1",
      });
      installFetch();
      renderView();

      expect(await screen.findByText("Blonde 33cl")).toBeInTheDocument();
      expect(screen.getByText(/4,50\s?€/)).toBeInTheDocument();
      expect(screen.getByText("Nouveau")).toBeInTheDocument();
    },
  );

  it("template TABLE : en-têtes de colonnes Produit / Prix", async () => {
    current = screenRender({
      template: "TABLE",
      items: [renderItem("cat-ipa", "IPA 33cl", { priceCents: 550 })],
      syncToken: "t1",
    });
    installFetch();
    renderView();

    expect(await screen.findByRole("columnheader", { name: "Produit" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Prix" })).toBeInTheDocument();
  });

  it("n'affiche que les produits du rendu (disponibles) ; mentions légales visibles", async () => {
    installFetch();
    renderView();

    expect(await screen.findByText("Blonde 33cl")).toBeInTheDocument();
    expect(screen.getByText("IPA 33cl")).toBeInTheDocument();
    // Un produit absent du rendu (indisponible) n'apparaît pas.
    expect(screen.queryByText("Stout 33cl")).not.toBeInTheDocument();
    expect(screen.getByText("L'abus d'alcool est dangereux pour la santé.")).toBeInTheDocument();
  });

  it("écran sans produit disponible : message dédié + mentions toujours affichées", async () => {
    current = screenRender({ items: [], syncToken: "empty" });
    installFetch();
    renderView();

    expect(await screen.findByText(/aucun produit disponible/i)).toBeInTheDocument();
    expect(screen.getByText("L'abus d'alcool est dangereux pour la santé.")).toBeInTheDocument();
  });
});

describe("vue d'affichage — resynchronisation (M7-13)", () => {
  it("re-fetch périodique : un produit tombé à 0 disparaît, puis réapparaît réapprovisionné", async () => {
    installFetch();
    renderView();

    expect(await screen.findByText("Blonde 33cl")).toBeInTheDocument();
    expect(screen.getByText("IPA 33cl")).toBeInTheDocument();
    const before = renderCalls();

    // La Blonde tombe à 0 (retirée du rendu) → nouveau jeton de sync.
    current = screenRender({
      items: [renderItem("cat-ipa", "IPA 33cl", { priceCents: 550 })],
      syncToken: "t2",
    });
    await waitFor(() => expect(screen.queryByText("Blonde 33cl")).not.toBeInTheDocument());
    expect(screen.getByText("IPA 33cl")).toBeInTheDocument();
    expect(renderCalls()).toBeGreaterThan(before); // le polling a bien eu lieu

    // Réapprovisionnement → la Blonde réapparaît.
    current = screenRender({
      items: [
        renderItem("cat-ipa", "IPA 33cl", { priceCents: 550 }),
        renderItem("cat-blonde", "Blonde 33cl", { priceCents: 450, sortOrder: 1 }),
      ],
      syncToken: "t3",
    });
    await waitFor(() => expect(screen.getByText("Blonde 33cl")).toBeInTheDocument());
  });

  it("jeton inchangé : le rendu affiché ne bascule pas malgré un poll", async () => {
    installFetch();
    renderView();

    expect(await screen.findByText("Blonde 33cl")).toBeInTheDocument();
    const before = renderCalls();

    // Contenu modifié MAIS jeton identique → la vue ne doit pas basculer (gating).
    current = screenRender({
      items: [renderItem("cat-blonde", "Blonde MODIFIÉE", { priceCents: 999 })],
      syncToken: "t1",
    });
    await waitFor(() => expect(renderCalls()).toBeGreaterThan(before));
    expect(screen.getByText("Blonde 33cl")).toBeInTheDocument();
    expect(screen.queryByText("Blonde MODIFIÉE")).not.toBeInTheDocument();
  });

  it("erreur réseau : conserve le dernier rendu + signale « hors ligne »", async () => {
    installFetch();
    renderView();

    expect(await screen.findByText("Blonde 33cl")).toBeInTheDocument();
    const before = renderCalls();

    failRender = true; // les resynchros suivantes échouent
    await waitFor(() => expect(renderCalls()).toBeGreaterThan(before));

    // Dernier rendu conservé (pas d'écran blanc) + indicateur discret + mentions visibles.
    expect(await screen.findByText(/hors ligne/i)).toBeInTheDocument();
    expect(screen.getByText("Blonde 33cl")).toBeInTheDocument();
    expect(screen.getByText("IPA 33cl")).toBeInTheDocument();
    expect(screen.getByText("L'abus d'alcool est dangereux pour la santé.")).toBeInTheDocument();
  });

  it("erreur au tout premier chargement : écran d'erreur + réessayer", async () => {
    failRender = true;
    installFetch();
    renderView();

    expect(await screen.findByText(/écran indisponible/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });
});

describe("vue d'affichage — route plein écran & RBAC (M7-13)", () => {
  it("route /display/screen/:id : rendu sans navigation d'app", async () => {
    installFetch();
    renderApp();

    expect(await screen.findByText("Blonde 33cl")).toBeInTheDocument();
    // Layout plein écran : pas d'en-tête applicatif (accueil / déconnexion).
    expect(screen.queryByRole("button", { name: /déconnexion/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Brasso" })).not.toBeInTheDocument();
  });

  it("rgpd : accès refusé et aucun appel de rendu", async () => {
    userRoles = ["rgpd"];
    installFetch();
    renderApp();

    expect(await screen.findByText(/accès réservé/i)).toBeInTheDocument();
    expect(renderCalls()).toBe(0);
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { DisplayScreen, DisplaySurface } from "@/lib/api";
import { useSession } from "@/stores/session";

let userRoles = ["admin"];
const USER = () => ({ id: "u1", email: "u@brasso.test", displayName: "Test", roles: userRoles });

let surfaces: DisplaySurface[] = [];
let screensBySurface: Record<string, DisplayScreen[]> = {};
let calls: { method: string; url: string; path: string; body: unknown }[] = [];
let seq = 0;

function surface(over: Partial<DisplaySurface> & { id: string; name: string }): DisplaySurface {
  const now = new Date("2026-07-16T10:00:00Z").toISOString();
  return {
    description: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function screenOf(
  over: Partial<DisplayScreen> & { id: string; surfaceId: string; name: string },
): DisplayScreen {
  const now = new Date("2026-07-16T10:00:00Z").toISOString();
  return {
    template: "CARDS",
    legalMentions: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
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

    // Surfaces (liste / création).
    if (path.endsWith("/api/display/surfaces") && method === "GET") {
      return Promise.resolve(json(200, { surfaces }));
    }
    if (path.endsWith("/api/display/surfaces") && method === "POST") {
      const created = surface({
        id: `srf-${++seq}`,
        name: body.name,
        description: body.description ?? null,
      });
      surfaces.push(created);
      return Promise.resolve(json(201, { surface: created }));
    }

    // Écrans d'une surface (liste / création).
    const screensMatch = /\/api\/display\/surfaces\/([^/]+)\/screens$/.exec(path);
    if (screensMatch) {
      const sid = screensMatch[1]!;
      if (method === "GET") {
        return Promise.resolve(json(200, { screens: screensBySurface[sid] ?? [] }));
      }
      if (method === "POST") {
        const created = screenOf({
          id: `scr-${++seq}`,
          surfaceId: sid,
          name: body.name,
          template: body.template ?? "CARDS",
          legalMentions: body.legalMentions ?? null,
        });
        (screensBySurface[sid] ??= []).push(created);
        return Promise.resolve(json(201, { screen: created }));
      }
    }

    // Items d'un écran (PUT remplace).
    const itemsMatch = /\/api\/display\/screens\/([^/]+)\/items$/.exec(path);
    if (itemsMatch && method === "PUT") {
      return Promise.resolve(json(200, { count: body.items.length }));
    }

    // Surface par id (PATCH / DELETE).
    const surfaceIdMatch = /\/api\/display\/surfaces\/([^/]+)$/.exec(path);
    if (surfaceIdMatch) {
      const id = surfaceIdMatch[1]!;
      if (method === "PATCH") {
        const s = surfaces.find((x) => x.id === id)!;
        Object.assign(s, body);
        return Promise.resolve(json(200, { surface: s }));
      }
      if (method === "DELETE") {
        surfaces = surfaces.filter((x) => x.id !== id);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
    }

    // Écran par id (PATCH / DELETE).
    const screenIdMatch = /\/api\/display\/screens\/([^/]+)$/.exec(path);
    if (screenIdMatch) {
      const id = screenIdMatch[1]!;
      if (method === "PATCH") {
        for (const sid of Object.keys(screensBySurface)) {
          const sc = screensBySurface[sid]!.find((x) => x.id === id);
          if (sc) {
            Object.assign(sc, body);
            return Promise.resolve(json(200, { screen: sc }));
          }
        }
      }
      if (method === "DELETE") {
        for (const sid of Object.keys(screensBySurface)) {
          screensBySurface[sid] = screensBySurface[sid]!.filter((x) => x.id !== id);
        }
        return Promise.resolve(new Response(null, { status: 204 }));
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
      <MemoryRouter initialEntries={["/display"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  userRoles = ["admin"];
  seq = 0;
  surfaces = [surface({ id: "srf-bar", name: "Bar", description: "Comptoir" })];
  screensBySurface = {
    "srf-bar": [screenOf({ id: "scr-1", surfaceId: "srf-bar", name: "Écran principal" })],
  };
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const putItemsCall = () =>
  calls.find((c) => c.method === "PUT" && /\/screens\/[^/]+\/items$/.test(c.path));

describe("config affichage — surfaces & écrans (M7-12)", () => {
  it("crée une surface (POST)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /nouvelle surface/i }));
    await user.type(screen.getByLabelText("Nom"), "Salle");
    await user.click(screen.getByRole("button", { name: /créer la surface/i }));

    await waitFor(() => {
      const post = calls.find(
        (c) => c.method === "POST" && c.path.endsWith("/api/display/surfaces"),
      );
      expect(post?.body).toMatchObject({ name: "Salle" });
    });
  });

  it("crée un écran avec template « Tableau » et des mentions légales (POST)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /nouvel écran/i }));
    await user.type(screen.getByLabelText("Nom de l'écran"), "Écran salle");
    await user.click(screen.getByLabelText("Tableau"));
    await user.type(
      screen.getByLabelText("Mentions légales"),
      "L'abus d'alcool est dangereux pour la santé.",
    );
    await user.click(screen.getByRole("button", { name: /créer l'écran/i }));

    await waitFor(() => {
      const post = calls.find(
        (c) => c.method === "POST" && /\/surfaces\/srf-bar\/screens$/.test(c.path),
      );
      expect(post?.body).toMatchObject({
        name: "Écran salle",
        template: "TABLE",
        legalMentions: "L'abus d'alcool est dangereux pour la santé.",
      });
    });
  });

  it("supprime un écran (DELETE)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const row = (await screen.findByText("Écran principal")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: /supprimer/i }));

    await waitFor(() => {
      expect(calls.some((c) => c.method === "DELETE" && /\/screens\/scr-1$/.test(c.path))).toBe(
        true,
      );
    });
  });
});

describe("config affichage — sélection de produits (M7-12)", () => {
  it("compose une sélection avec flag + tri par boutons, puis PUT items", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const row = (await screen.findByText("Écran principal")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: /produits/i }));

    const dialog = await screen.findByRole("dialog");
    const addSelect = within(dialog).getByLabelText("Ajouter un produit");
    // Ajoute Blonde puis IPA (ordre initial : [Blonde, IPA]).
    await user.selectOptions(addSelect, "cat-blonde");
    await user.click(within(dialog).getByRole("button", { name: /^ajouter$/i }));
    await user.selectOptions(addSelect, "cat-ipa");
    await user.click(within(dialog).getByRole("button", { name: /^ajouter$/i }));

    // Coup de cœur sur la Blonde.
    const blondeRow = within(dialog).getByText("Blonde 33cl").closest("li")!;
    await user.click(within(blondeRow).getByRole("checkbox", { name: /coup de cœur/i }));
    await user.type(within(blondeRow).getByLabelText(/prix affiché/i), "4,50");

    // Descend la Blonde → ordre [IPA, Blonde].
    await user.click(within(dialog).getByRole("button", { name: /descendre blonde 33cl/i }));

    await user.click(within(dialog).getByRole("button", { name: /enregistrer la sélection/i }));

    await waitFor(() => {
      const put = putItemsCall();
      expect(put?.body).toEqual({
        items: [
          {
            catalogItemId: "cat-ipa",
            isNew: false,
            isFavorite: false,
            isSpecial: false,
            priceCents: null,
            sortOrder: 0,
          },
          {
            catalogItemId: "cat-blonde",
            isNew: false,
            isFavorite: true,
            isSpecial: false,
            priceCents: 450,
            sortOrder: 1,
          },
        ],
      });
    });
  });
});

describe("config affichage — RBAC UI (M7-12)", () => {
  it("brasseur : RU — édite écran/produits mais pas de création/suppression", async () => {
    userRoles = ["brasseur"];
    installFetch();
    renderApp();

    expect(await screen.findByText("Bar")).toBeInTheDocument();
    // Attendre le chargement des écrans (query imbriquée) via la ligne d'écran.
    await screen.findByText("Écran principal");
    // Création/suppression masquées (admin only).
    expect(screen.queryByRole("button", { name: /nouvelle surface/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nouvel écran/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /supprimer/i })).not.toBeInTheDocument();
    // Édition (RU) disponible.
    expect(screen.getByRole("button", { name: /produits/i })).toBeInTheDocument();
  });

  it("rgpd : écran masqué et aucune requête affichage", async () => {
    userRoles = ["rgpd"];
    installFetch();
    renderApp();

    expect(await screen.findByText(/accès réservé aux rôles habilités/i)).toBeInTheDocument();
    expect(screen.queryByText("Bar")).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.includes("/api/display/"))).toBe(false);
  });
});

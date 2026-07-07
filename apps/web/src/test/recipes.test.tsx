import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { createInputForDrinkType, engineForDrinkType } from "@/features/recipes/labels";
import type { RecipeDetail, RecipeEngine } from "@/lib/api";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

// ── Faux serveur recettes (état en mémoire) ──────────────────────────────────

let recipes: RecipeDetail[] = [];
let nextId = 1;
let calls: { method: string; url: string; body: unknown }[] = [];

function makeRecipe(
  over: Partial<RecipeDetail> & { engine: RecipeEngine; name: string },
): RecipeDetail {
  const id = `r${nextId++}`;
  const now = new Date("2026-07-06T10:00:00Z").toISOString();
  return {
    id,
    familyId: id,
    version: 1,
    status: "DRAFT",
    notes: null,
    createdAt: now,
    updatedAt: now,
    beerDetails: null,
    altDetails: null,
    softDetails: null,
    ingredients: [],
    steps: [],
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
    calls.push({ method, url, body });

    if (path.endsWith("/auth/me")) {
      return Promise.resolve(json(200, { user: USER }));
    }

    if (path.endsWith("/api/recipes") && method === "GET") {
      const engine = query.get("engine");
      const status = query.get("status");
      const filtered = recipes.filter(
        (r) => (!engine || r.engine === engine) && (!status || r.status === status),
      );
      return Promise.resolve(json(200, { recipes: filtered }));
    }

    if (path.endsWith("/api/recipes") && method === "POST") {
      const created = makeRecipe({
        engine: body.engine,
        name: body.name,
        notes: body.notes ?? null,
      });
      recipes.push(created);
      return Promise.resolve(json(201, { recipe: created }));
    }

    const id = path.match(/\/api\/recipes\/(.+)$/)?.[1];
    if (id) {
      const found = recipes.find((r) => r.id === id);
      if (!found) {
        return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
      }
      if (method === "GET") {
        return Promise.resolve(json(200, { recipe: found }));
      }
      if (method === "PATCH") {
        const updated: RecipeDetail = {
          ...found,
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          updatedAt: new Date().toISOString(),
        };
        recipes = recipes.map((r) => (r.id === id ? updated : r));
        return Promise.resolve(json(200, { recipe: updated }));
      }
    }

    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp(initialEntries: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  recipes = [];
  nextId = 1;
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapping type de boisson → moteur", () => {
  it("un fermenté alternatif mappe vers ALT_FERMENTED avec baseType", () => {
    expect(engineForDrinkType("GINGER_BEER")).toBe("ALT_FERMENTED");
    expect(createInputForDrinkType("GINGER_BEER", "Ma GB")).toEqual({
      engine: "ALT_FERMENTED",
      name: "Ma GB",
      altDetails: { baseType: "GINGER_BEER" },
    });
  });

  it("bière → BEER, limonade → SOFT_DRINK (sans détail imposé)", () => {
    expect(createInputForDrinkType("BIERE", "IPA")).toEqual({ engine: "BEER", name: "IPA" });
    expect(engineForDrinkType("LIMONADE")).toBe("SOFT_DRINK");
    expect(createInputForDrinkType("LIMONADE", "Citron")).toEqual({
      engine: "SOFT_DRINK",
      name: "Citron",
    });
  });
});

describe("liste des recettes", () => {
  it("affiche les recettes renvoyées par l'API", async () => {
    recipes.push(makeRecipe({ engine: "BEER", name: "IPA maison" }));
    recipes.push(makeRecipe({ engine: "SOFT_DRINK", name: "Limonade citron" }));
    installFetch();
    renderApp(["/recipes"]);

    expect(await screen.findByText("IPA maison")).toBeInTheDocument();
    expect(screen.getByText("Limonade citron")).toBeInTheDocument();
  });

  it("liste vide → invite à créer une recette", async () => {
    installFetch();
    renderApp(["/recipes"]);

    expect(await screen.findByText(/aucune recette/i)).toBeInTheDocument();
  });
});

describe("création d'une recette", () => {
  it("type ginger beer → POST moteur ALT_FERMENTED puis ouverture de l'éditeur", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp(["/recipes/new"]);

    await user.selectOptions(await screen.findByLabelText(/type de boisson/i), "GINGER_BEER");
    expect(screen.getByText("Fermenté alternatif")).toBeInTheDocument(); // moteur proposé

    await user.type(screen.getByLabelText(/nom de la recette/i), "Ginger du fût");
    await user.click(screen.getByRole("button", { name: /créer et ouvrir/i }));

    // Redirection vers l'éditeur : en-tête portant le nom de la recette créée.
    expect(await screen.findByRole("heading", { name: "Ginger du fût" })).toBeInTheDocument();

    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/recipes"));
    expect(post?.body).toEqual({
      engine: "ALT_FERMENTED",
      name: "Ginger du fût",
      altDetails: { baseType: "GINGER_BEER" },
    });
  });
});

describe("shell éditeur", () => {
  it("modifier le nom lève l'indicateur dirty puis PATCH à l'enregistrement", async () => {
    const recipe = makeRecipe({ engine: "BEER", name: "IPA maison" });
    recipes.push(recipe);
    installFetch();
    const user = userEvent.setup();
    renderApp([`/recipes/${recipe.id}/edit`]);

    const nameInput = await screen.findByLabelText("Nom");
    expect(screen.queryByText(/modifications non enregistrées/i)).not.toBeInTheDocument();

    await user.clear(nameInput);
    await user.type(nameInput, "IPA maison v2");
    expect(screen.getByText(/modifications non enregistrées/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    expect(await screen.findByText(/modifications enregistrées/i)).toBeInTheDocument();
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toMatchObject({ name: "IPA maison v2" });
  });
});

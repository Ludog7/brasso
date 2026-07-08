import {
  ALT_PH_REQUIRED,
  ALT_STABILIZATION_REQUIRED,
  recipePublicationCheck,
  type RecipePublicationInput,
} from "@brasso/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { RecipeDetail, RecipeEngine } from "@/lib/api";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

// ── Faux serveur recettes avec cycle de vie (état en mémoire) ─────────────────

let recipes: RecipeDetail[] = [];
let nextId = 1;
let calls: { method: string; url: string; body: unknown }[] = [];

function makeRecipe(
  over: Partial<RecipeDetail> & { engine: RecipeEngine; name: string },
): RecipeDetail {
  const id = `r${nextId++}`;
  const now = new Date("2026-07-08T10:00:00Z").toISOString();
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

/** Projette une recette vers l'entrée de `recipePublicationCheck` (miroir de l'API). */
function publicationInput(recipe: RecipeDetail): RecipePublicationInput {
  type Stab = RecipePublicationInput["stabilizationMethod"];
  if (recipe.engine === "ALT_FERMENTED") {
    return {
      engine: "ALT_FERMENTED",
      ph: recipe.altDetails?.targetPh ?? null,
      stabilizationMethod: (recipe.altDetails?.stabilizationMethod ?? null) as Stab,
    };
  }
  if (recipe.engine === "SOFT_DRINK") {
    return {
      engine: "SOFT_DRINK",
      ph: recipe.softDetails?.targetPh ?? null,
      storageMode: (recipe.softDetails?.storageMode as "cold" | "ambient" | null) ?? null,
      stabilizationMethod: (recipe.softDetails?.stabilizationMethod ?? null) as Stab,
    };
  }
  return { engine: "BEER" };
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
    if (path.endsWith("/api/bjcp-styles")) {
      return Promise.resolve(json(200, { styles: [] }));
    }

    if (path.endsWith("/api/recipes") && method === "GET") {
      const familyId = query.get("familyId");
      const status = query.get("status");
      const filtered = recipes.filter(
        (r) => (!familyId || r.familyId === familyId) && (!status || r.status === status),
      );
      return Promise.resolve(json(200, { recipes: filtered }));
    }

    const publishId = path.match(/\/api\/recipes\/(.+)\/publish$/)?.[1];
    if (publishId && method === "POST") {
      const found = recipes.find((r) => r.id === publishId);
      if (!found) return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "x" } }));
      const check = recipePublicationCheck(publicationInput(found));
      if (!check.publishable) {
        return Promise.resolve(
          json(422, {
            error: {
              code: "NOT_PUBLISHABLE",
              message: "Recette non publiable en l'état (règles core)",
              details: { errors: check.errors },
            },
          }),
        );
      }
      found.status = "PUBLISHED";
      found.updatedAt = new Date().toISOString();
      return Promise.resolve(json(200, { recipe: found }));
    }

    const newVersionId = path.match(/\/api\/recipes\/(.+)\/new-version$/)?.[1];
    if (newVersionId && method === "POST") {
      const source = recipes.find((r) => r.id === newVersionId);
      if (!source)
        return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "x" } }));
      const draft = makeRecipe({
        engine: source.engine,
        name: source.name,
        familyId: source.familyId,
        version: source.version + 1,
        status: "DRAFT",
        beerDetails: source.beerDetails,
        altDetails: source.altDetails,
        softDetails: source.softDetails,
      });
      recipes.push(draft);
      return Promise.resolve(json(201, { recipe: draft }));
    }

    const archiveId = path.match(/\/api\/recipes\/(.+)\/archive$/)?.[1];
    if (archiveId && method === "POST") {
      const found = recipes.find((r) => r.id === archiveId);
      if (!found) return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "x" } }));
      found.status = "ARCHIVED";
      found.updatedAt = new Date().toISOString();
      return Promise.resolve(json(200, { recipe: found }));
    }

    const id = path.match(/\/api\/recipes\/([^/]+)$/)?.[1];
    if (id && method === "GET") {
      const found = recipes.find((r) => r.id === id);
      return found
        ? Promise.resolve(json(200, { recipe: found }))
        : Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
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
  vi.restoreAllMocks();
});

describe("page détail — publication", () => {
  it("un brouillon ALT sans pH ni stabilisation : 422 → restitue les manquements", async () => {
    const recipe = makeRecipe({
      engine: "ALT_FERMENTED",
      name: "Ginger du fût",
      altDetails: {
        baseType: "GINGER_BEER",
        targetPh: null,
        stabilizationMethod: null,
        residualSugarRisk: false,
        batchVolumeL: null,
      },
    });
    recipes.push(recipe);
    installFetch();
    const user = userEvent.setup();
    renderApp([`/recipes/${recipe.id}`]);

    await user.click(await screen.findByRole("button", { name: /publier/i }));

    const alert = await screen.findByText(/à compléter/i);
    const box = alert.closest("[role='alert']") as HTMLElement;
    expect(within(box).getByText(ALT_PH_REQUIRED)).toBeInTheDocument();
    expect(within(box).getByText(ALT_STABILIZATION_REQUIRED)).toBeInTheDocument();
    // La recette reste un brouillon (aucune transition serveur).
    expect(recipes[0]?.status).toBe("DRAFT");
  });

  it("un brouillon BEER publie sans erreur puis expose les actions de version", async () => {
    const recipe = makeRecipe({ engine: "BEER", name: "IPA maison" });
    recipes.push(recipe);
    installFetch();
    const user = userEvent.setup();
    renderApp([`/recipes/${recipe.id}`]);

    await user.click(await screen.findByRole("button", { name: /publier/i }));

    expect(await screen.findByRole("button", { name: /nouvelle version/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /archiver/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^publier$/i })).not.toBeInTheDocument();
    expect(recipes[0]?.status).toBe("PUBLISHED");
  });
});

describe("page détail — versions & lecture seule", () => {
  it("navigue vers une autre version de la famille via le sélecteur", async () => {
    const v1 = makeRecipe({
      engine: "BEER",
      name: "Saison",
      familyId: "fam",
      version: 1,
      status: "PUBLISHED",
    });
    const v2 = makeRecipe({
      engine: "BEER",
      name: "Saison",
      familyId: "fam",
      version: 2,
      status: "DRAFT",
    });
    recipes.push(v1, v2);
    installFetch();
    const user = userEvent.setup();
    renderApp([`/recipes/${v2.id}`]);

    // v2 est un brouillon → action « Publier » proposée.
    expect(await screen.findByRole("button", { name: /publier/i })).toBeInTheDocument();

    await user.selectOptions(await screen.findByLabelText(/version/i), v1.id);

    // v1 est publiée → bascule sur les actions de version, plus de « Publier ».
    expect(await screen.findByRole("button", { name: /nouvelle version/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^publier$/i })).not.toBeInTheDocument();
  });

  it("une recette publiée n'expose aucune édition hormis nouvelle version / archiver", async () => {
    const recipe = makeRecipe({ engine: "BEER", name: "Stout", status: "PUBLISHED" });
    recipes.push(recipe);
    installFetch();
    renderApp([`/recipes/${recipe.id}`]);

    expect(await screen.findByRole("button", { name: /nouvelle version/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /archiver/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /modifier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^publier$/i })).not.toBeInTheDocument();
  });

  it("une recette archivée est en lecture seule stricte (aucune action)", async () => {
    const recipe = makeRecipe({ engine: "BEER", name: "Vieux lot", status: "ARCHIVED" });
    recipes.push(recipe);
    installFetch();
    renderApp([`/recipes/${recipe.id}`]);

    expect(await screen.findByText(/recette archivée/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nouvelle version/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /archiver/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^publier$/i })).not.toBeInTheDocument();
  });

  it("« nouvelle version » crée le brouillon n+1 et ouvre son éditeur", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const recipe = makeRecipe({
      engine: "BEER",
      name: "Porter",
      status: "PUBLISHED",
      version: 1,
    });
    recipes.push(recipe);
    installFetch();
    const user = userEvent.setup();
    renderApp([`/recipes/${recipe.id}`]);

    await user.click(await screen.findByRole("button", { name: /nouvelle version/i }));

    // Redirection vers l'éditeur du nouveau brouillon (bouton « Enregistrer » présent).
    expect(await screen.findByRole("button", { name: /enregistrer/i })).toBeInTheDocument();
    const created = recipes.find((r) => r.version === 2);
    expect(created?.status).toBe("DRAFT");
    expect(
      calls.some(
        (c) => c.method === "POST" && c.url.endsWith(`/api/recipes/${recipe.id}/new-version`),
      ),
    ).toBe(true);
  });
});

import { BJCP_STYLES } from "@brasso/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { BeerDetails, RecipeDetail, RecipeIngredientView, RecipeStepView } from "@/lib/api";
import { useSession } from "@/stores/session";

const USER = { id: "u1", email: "b@brasso.test", displayName: "Brasseur", roles: ["brasseur"] };

interface IngredientsBody {
  ingredients: Array<Omit<RecipeIngredientView, "id" | "sortOrder">>;
}
interface StepsBody {
  steps: Array<Omit<RecipeStepView, "id" | "sortOrder">>;
}
interface PatchBody {
  name?: string;
  notes?: string | null;
  beerDetails?: Partial<BeerDetails>;
}

let recipe: RecipeDetail;
let calls: { method: string; url: string; body: unknown }[] = [];
let clock = Date.parse("2026-07-06T10:00:00Z");

function touch() {
  clock += 1000;
  recipe.updatedAt = new Date(clock).toISOString();
}

/** Recette BEER DRAFT de départ : 5 kg de malt Pale, volume 20 L, efficacité 72 %. */
function seedRecipe(styleBjcp: string | null): RecipeDetail {
  const now = new Date(clock).toISOString();
  return {
    id: "r1",
    familyId: "r1",
    version: 1,
    name: "IPA maison",
    engine: "BEER",
    status: "DRAFT",
    notes: null,
    createdAt: now,
    updatedAt: now,
    beerDetails: {
      styleBjcp,
      targetOg: null,
      targetFg: null,
      targetIbu: null,
      targetEbc: null,
      boilTimeMin: 60,
      efficiency: 0.72,
      batchVolumeL: 20,
    },
    altDetails: null,
    softDetails: null,
    ingredients: [
      {
        id: "ing-malt",
        catalogItemId: null,
        name: "Pale",
        category: "MALT",
        use: null,
        amount: 5000,
        unit: "GRAM",
        timeMinutes: null,
        sortOrder: 0,
        params: { colorEbc: 7, potentialSg: 1.037, isMashable: true },
      },
    ],
    steps: [],
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
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));
    if (path.endsWith("/api/bjcp-styles")) {
      return Promise.resolve(json(200, { styles: BJCP_STYLES }));
    }
    if (path.endsWith("/api/catalog-items")) {
      return Promise.resolve(json(200, { items: [], total: 0, limit: 50, offset: 0 }));
    }

    if (path.endsWith("/ingredients") && method === "PUT") {
      recipe.ingredients = (body as IngredientsBody).ingredients.map((it, i) => ({
        ...it,
        id: `ing-${i}`,
        sortOrder: i,
      }));
      touch();
      return Promise.resolve(json(200, { recipe }));
    }
    if (path.endsWith("/steps") && method === "PUT") {
      recipe.steps = (body as StepsBody).steps.map((it, i) => ({
        ...it,
        id: `step-${i}`,
        sortOrder: i,
      }));
      touch();
      return Promise.resolve(json(200, { recipe }));
    }

    const match = path.match(/\/api\/recipes\/([^/]+)$/);
    if (match) {
      if (method === "GET") return Promise.resolve(json(200, { recipe }));
      if (method === "PATCH") {
        const patch = body as PatchBody;
        if (patch.name !== undefined) recipe.name = patch.name;
        if (patch.notes !== undefined) recipe.notes = patch.notes;
        if (patch.beerDetails && recipe.beerDetails) {
          recipe.beerDetails = { ...recipe.beerDetails, ...patch.beerDetails };
        }
        touch();
        return Promise.resolve(json(200, { recipe }));
      }
    }
    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "x" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/recipes/r1/edit"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const metric = (id: string) => parseFloat(screen.getByTestId(id).textContent ?? "0");

beforeEach(() => {
  clock = Date.parse("2026-07-06T10:00:00Z");
  calls = [];
  recipe = seedRecipe(null);
  useSession.setState({ user: null });
});

afterEach(() => vi.unstubAllGlobals());

describe("éditeur BEER — panneau temps réel", () => {
  it("augmenter la quantité de malt fait monter l'OG et l'ABV", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await screen.findByTestId("metric-og");
    const og0 = metric("metric-og");
    const abv0 = metric("metric-abv");

    const qty = screen.getByLabelText("Quantité (g)");
    await user.clear(qty);
    await user.type(qty, "9000");

    await waitFor(() => expect(metric("metric-og")).toBeGreaterThan(og0));
    expect(metric("metric-abv")).toBeGreaterThan(abv0);
  });

  it("jauges alignées sur le style BJCP sélectionné", async () => {
    recipe = seedRecipe("5D"); // German Pils : OG bien en dessous, EBC au-dessus
    installFetch();
    renderApp();

    // Le style se charge de façon asynchrone → la jauge EBC passe « au-dessus ».
    expect(await screen.findByText("au-dessus")).toBeInTheDocument();
    expect(screen.getAllByText("sous la plage").length).toBeGreaterThan(0);
  });
});

describe("éditeur BEER — sauvegarde", () => {
  it("enregistre les intrants via PUT ingredients puis confirme", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const qty = await screen.findByLabelText("Quantité (g)");
    await user.clear(qty);
    await user.type(qty, "9000");

    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    expect(await screen.findByText(/modifications enregistrées/i)).toBeInTheDocument();
    const put = calls.find((c) => c.method === "PUT" && c.url.includes("/ingredients"));
    const ingredients = (put?.body as IngredientsBody | undefined)?.ingredients;
    expect(ingredients?.[0]).toMatchObject({ category: "MALT", name: "Pale", amount: 9000 });
  });
});

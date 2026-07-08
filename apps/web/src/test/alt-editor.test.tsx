import { ALT_STABILIZATION_REQUIRED, FOOD_SAFETY_DISCLAIMER } from "@brasso/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { AltDetails, RecipeDetail, RecipeIngredientView, RecipeStepView } from "@/lib/api";
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
  altDetails?: Partial<AltDetails>;
}

let recipe: RecipeDetail;
let calls: { method: string; url: string; body: unknown }[] = [];
let clock = Date.parse("2026-07-06T10:00:00Z");

function touch() {
  clock += 1000;
  recipe.updatedAt = new Date(clock).toISOString();
}

/**
 * Ginger beer DRAFT : pH 4,8 (> seuil 4,6 → zone de vigilance), sucre résiduel
 * présent, **non stabilisée** — cas typique du risque de surpression.
 */
function seedRecipe(over: Partial<AltDetails> = {}): RecipeDetail {
  const now = new Date(clock).toISOString();
  return {
    id: "r1",
    familyId: "r1",
    version: 1,
    name: "Ginger du fût",
    engine: "ALT_FERMENTED",
    status: "DRAFT",
    notes: null,
    createdAt: now,
    updatedAt: now,
    beerDetails: null,
    altDetails: {
      baseType: "GINGER_BEER",
      targetPh: 4.8,
      stabilizationMethod: null,
      residualSugarRisk: true,
      batchVolumeL: 10,
      ...over,
    },
    softDetails: null,
    ingredients: [],
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
        if (patch.altDetails && recipe.altDetails) {
          recipe.altDetails = { ...recipe.altDetails, ...patch.altDetails };
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

beforeEach(() => {
  clock = Date.parse("2026-07-06T10:00:00Z");
  calls = [];
  recipe = seedRecipe();
  useSession.setState({ user: null });
});

afterEach(() => vi.unstubAllGlobals());

describe("éditeur ALT — indicateurs sécurité (ADR-11)", () => {
  it("affiche pH + alerte carbonatation + disclaimer, sans IBU/EBC ni verdict « conforme »/« sûr »", async () => {
    installFetch();
    renderApp();

    // Indicateur pH : pH 4,8 > 4,6 → zone de vigilance (reflète `phIndicator` du core).
    const phStatus = await screen.findByTestId("alt-ph-status");
    expect(phStatus).toHaveTextContent(/zone de vigilance/i);

    // Alerte carbonatation : sucre résiduel + non stabilisée + ambiant → à risque.
    expect(screen.getByTestId("alt-carbonation-risk")).toBeInTheDocument();

    // Disclaimer permanent imposé (ADR-11).
    expect(screen.getByTestId("alt-disclaimer")).toHaveTextContent(FOOD_SAFETY_DISCLAIMER);

    // Bandeau publication : stabilisation obligatoire (message issu du core).
    expect(screen.getByText(ALT_STABILIZATION_REQUIRED)).toBeInTheDocument();

    // IBU/EBC ne sont pas calculés pour ALT → absents du DOM.
    const main = document.querySelector("main");
    expect(main?.textContent ?? "").not.toMatch(/\bIBU\b/);
    expect(main?.textContent ?? "").not.toMatch(/\bEBC\b/);

    // ADR-11 : jamais de verdict « conforme » / « sûr ».
    expect(main?.textContent ?? "").not.toMatch(/conforme/i);
    expect(main?.textContent ?? "").not.toMatch(/\bsûre?\b/i);
  });

  it("choisir une méthode de stabilisation retire l'alerte de carbonatation (reflète le core)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByTestId("alt-carbonation-risk")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/méthode de stabilisation/i), "COLD_CHAIN");

    await waitFor(() =>
      expect(screen.queryByTestId("alt-carbonation-risk")).not.toBeInTheDocument(),
    );
    // Le bandeau « stabilisation obligatoire » disparaît lui aussi.
    expect(screen.queryByText(ALT_STABILIZATION_REQUIRED)).not.toBeInTheDocument();
  });

  it("le statut pH suit le seuil 4,6 du core (acide sous le seuil)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const ph = await screen.findByLabelText(/pH cible/i);
    await user.clear(ph);
    await user.type(ph, "4.2");

    await waitFor(() =>
      expect(screen.getByTestId("alt-ph-status")).toHaveTextContent(/sous le seuil/i),
    );
  });
});

describe("éditeur ALT — estimation ABV", () => {
  it("l'ABV estimé apparaît une fois OG et FG saisies", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByTestId("alt-abv")).toHaveTextContent("—");

    await user.type(screen.getByLabelText(/OG \(densité initiale\)/i), "1.050");
    await user.type(screen.getByLabelText(/FG \(densité finale\)/i), "1.010");

    // calcAbv(1.050, 1.010) = 0.04 × 131.25 = 5.25 % (via `computeAltFermented`).
    await waitFor(() => expect(screen.getByTestId("alt-abv")).toHaveTextContent(/5\.[23] %/));
  });
});

describe("éditeur ALT — sauvegarde", () => {
  it("enregistre les détails ALT via PATCH puis confirme", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const ph = await screen.findByLabelText(/pH cible/i);
    await user.clear(ph);
    await user.type(ph, "4.2");

    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    expect(await screen.findByText(/modifications enregistrées/i)).toBeInTheDocument();
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toMatchObject({
      name: "Ginger du fût",
      altDetails: { baseType: "GINGER_BEER", residualSugarRisk: true, targetPh: 4.2 },
    });
  });
});

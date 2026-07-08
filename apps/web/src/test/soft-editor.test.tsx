import { FOOD_SAFETY_DISCLAIMER, SOFT_STABILIZATION_REQUIRED } from "@brasso/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { RecipeDetail, RecipeIngredientView, RecipeStepView, SoftDetails } from "@/lib/api";
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
  softDetails?: Partial<SoftDetails>;
}

let recipe: RecipeDetail;
let calls: { method: string; url: string; body: unknown }[] = [];
let clock = Date.parse("2026-07-08T10:00:00Z");

function touch() {
  clock += 1000;
  recipe.updatedAt = new Date(clock).toISOString();
}

/**
 * Limonade DRAFT : pH 4,8 (> seuil 4,6 → zone de vigilance), stockage **ambiant**,
 * **non stabilisée** — cas typique du rappel de stabilisation (critère DoD).
 */
function seedRecipe(over: Partial<SoftDetails> = {}): RecipeDetail {
  const now = new Date(clock).toISOString();
  return {
    id: "r1",
    familyId: "r1",
    version: 1,
    name: "Limonade maison",
    engine: "SOFT_DRINK",
    status: "DRAFT",
    notes: null,
    createdAt: now,
    updatedAt: now,
    beerDetails: null,
    altDetails: null,
    softDetails: {
      sugarConcentration: 90,
      targetPh: 4.8,
      storageMode: "ambient",
      stabilizationMethod: null,
      batchVolumeL: 5,
      ...over,
    },
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
        if (patch.softDetails && recipe.softDetails) {
          recipe.softDetails = { ...recipe.softDetails, ...patch.softDetails };
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
  clock = Date.parse("2026-07-08T10:00:00Z");
  calls = [];
  recipe = seedRecipe();
  useSession.setState({ user: null });
});

afterEach(() => vi.unstubAllGlobals());

describe("éditeur SOFT — indicateurs sécurité (ADR-11)", () => {
  it("limonade ambiant pH 4,8 : indicateur pH + rappel de stabilisation + disclaimer, sans ABV/IBU/EBC ni verdict « conforme »/« sûr »", async () => {
    installFetch();
    renderApp();

    // Indicateur pH : pH 4,8 > 4,6 → zone de vigilance (reflète `phIndicator` du core).
    const phStatus = await screen.findByTestId("soft-ph-status");
    expect(phStatus).toHaveTextContent(/zone de vigilance/i);

    // Concentration en sucre remontée depuis le core.
    expect(screen.getByTestId("soft-sugar")).toHaveTextContent(/90 g\/L/);

    // Rappel de stabilisation : ambiant + pH > 4,6 + non stabilisée (critère DoD).
    expect(screen.getByTestId("soft-stabilization")).toBeInTheDocument();

    // Disclaimer permanent imposé (ADR-11).
    expect(screen.getByTestId("soft-disclaimer")).toHaveTextContent(FOOD_SAFETY_DISCLAIMER);

    // Bandeau publication : stabilisation requise (message issu du core).
    expect(screen.getByText(SOFT_STABILIZATION_REQUIRED)).toBeInTheDocument();

    // Pas d'alcool ni d'IBU/EBC pour SOFT → absents du DOM.
    const main = document.querySelector("main");
    expect(main?.textContent ?? "").not.toMatch(/\bABV\b/i);
    expect(main?.textContent ?? "").not.toMatch(/alcool/i);
    expect(main?.textContent ?? "").not.toMatch(/\bIBU\b/);
    expect(main?.textContent ?? "").not.toMatch(/\bEBC\b/);

    // ADR-11 : jamais de verdict « conforme » / « sûr ».
    expect(main?.textContent ?? "").not.toMatch(/conforme/i);
    expect(main?.textContent ?? "").not.toMatch(/\bsûre?\b/i);
  });

  it("passer la conservation en froid retire le rappel de stabilisation (reflète le core)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByTestId("soft-stabilization")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/mode de conservation/i), "cold");

    await waitFor(() =>
      expect(screen.queryByTestId("soft-stabilization")).not.toBeInTheDocument(),
    );
    // Le bandeau « stabilisation requise » disparaît lui aussi.
    expect(screen.queryByText(SOFT_STABILIZATION_REQUIRED)).not.toBeInTheDocument();
  });

  it("le statut pH suit le seuil 4,6 du core (acide sous le seuil)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const ph = await screen.findByLabelText(/pH cible/i);
    await user.clear(ph);
    await user.type(ph, "4.2");

    await waitFor(() =>
      expect(screen.getByTestId("soft-ph-status")).toHaveTextContent(/sous le seuil/i),
    );
    // Sous le seuil et ambiant : plus de rappel de stabilisation.
    expect(screen.queryByTestId("soft-stabilization")).not.toBeInTheDocument();
  });
});

describe("éditeur SOFT — sauvegarde", () => {
  it("enregistre les détails SOFT via PATCH puis confirme", async () => {
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
      name: "Limonade maison",
      softDetails: { sugarConcentration: 90, storageMode: "ambient", targetPh: 4.2 },
    });
  });
});

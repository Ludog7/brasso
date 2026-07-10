import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { BatchDetail, EquipmentProfile, RecipeDetail } from "@/lib/api";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

const ISO = new Date("2026-07-10T10:00:00Z").toISOString();

function makeRecipe(over: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: "r1",
    familyId: "r1",
    version: 2,
    name: "IPA maison",
    engine: "BEER",
    status: "PUBLISHED",
    notes: null,
    createdAt: ISO,
    updatedAt: ISO,
    beerDetails: {
      styleBjcp: "21A",
      targetOg: 1.06,
      targetFg: 1.012,
      targetIbu: 50,
      targetEbc: 20,
      boilTimeMin: 60,
      efficiency: 0.72,
      batchVolumeL: 20,
    },
    altDetails: null,
    softDetails: null,
    ingredients: [
      {
        id: "i1",
        catalogItemId: "cat-malt",
        name: "Pale Ale",
        category: "MALT",
        use: null,
        amount: 5000,
        unit: "GRAM",
        timeMinutes: null,
        sortOrder: 0,
        params: {},
      },
      {
        id: "i2",
        catalogItemId: "cat-hop",
        name: "Cascade",
        category: "HOP",
        use: "BOIL",
        amount: 50,
        unit: "GRAM",
        timeMinutes: 60,
        sortOrder: 1,
        params: {},
      },
      {
        id: "i3",
        catalogItemId: null,
        name: "Flocons d'avoine",
        category: "MALT",
        use: null,
        amount: 500,
        unit: "GRAM",
        timeMinutes: null,
        sortOrder: 2,
        params: {},
      },
    ],
    steps: [],
    ...over,
  };
}

const PROFILE: EquipmentProfile = {
  id: "eq1",
  name: "Cuve 50L",
  nominalVolumeL: 50,
  deadspaceL: 2,
  transferLossL: 1,
  evaporationRateLPerHour: 3,
  grainAbsorptionLPerKg: 1,
  heatingPowerKw: null,
  thermalMassKjPerC: null,
  waterProfiles: null,
  isActive: true,
  createdAt: ISO,
  updatedAt: ISO,
};

const BATCH: BatchDetail = {
  id: "b1",
  batchNumber: 42,
  recipeId: "r1",
  recipeVersion: 2,
  equipmentProfileId: "eq1",
  status: "PLANIFIE",
  plannedAt: null,
  brewedAt: null,
  fermentedAt: null,
  packagedAt: null,
  completedAt: null,
  createdAt: ISO,
  updatedAt: ISO,
  recipeSnapshot: { ingredients: makeRecipe().ingredients },
  reservations: [
    { id: "res1", catalogItemId: "cat-malt", quantity: 5000, status: "RESERVED" },
    { id: "res2", catalogItemId: "cat-hop", quantity: 50, status: "RESERVED" },
  ],
};

let recipe: RecipeDetail;
let calls: { method: string; url: string; body: unknown }[] = [];

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

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));

    if (/\/api\/recipes\/[^/]+$/.exec(path) && method === "GET") {
      return Promise.resolve(json(200, { recipe }));
    }

    if (path.endsWith("/api/equipment-profiles") && method === "GET") {
      const active = query.get("active");
      const list = active === "false" ? [] : [PROFILE];
      return Promise.resolve(json(200, { profiles: list }));
    }

    const eqId = /\/api\/equipment-profiles\/([^/]+)$/.exec(path)?.[1];
    if (eqId && method === "GET") {
      return Promise.resolve(json(200, { profile: PROFILE }));
    }

    if (path.endsWith("/api/batches") && method === "POST") {
      return Promise.resolve(
        json(201, { batch: BATCH, unreservedIngredients: ["Flocons d'avoine"], stockWarnings: [] }),
      );
    }

    if (/\/api\/batches\/[^/]+$/.exec(path) && method === "GET") {
      return Promise.resolve(json(200, { batch: BATCH }));
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
  recipe = makeRecipe();
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("planifier un batch (M3-08)", () => {
  it("affiche l'aperçu des volumes après choix d'un profil d'équipement", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp(["/batches/new/r1"]);

    const select = await screen.findByLabelText(/profil d'équipement/i);
    await user.selectOptions(select, "eq1");

    // Pré-ébullition = batchVolume(20) + transfert(1) + évaporation(3×60/60) = 24 L.
    expect(await screen.findByText("24 L")).toBeInTheDocument();
    expect(screen.getByText("Empâtage")).toBeInTheDocument();
    expect(screen.getByText("Rinçage")).toBeInTheDocument();
  });

  it("liste les réservations de stock prévues et les ingrédients hors catalogue", async () => {
    installFetch();
    renderApp(["/batches/new/r1"]);

    expect(await screen.findByText("Pale Ale")).toBeInTheDocument();
    expect(screen.getByText("Cascade")).toBeInTheDocument();
    expect(screen.getByText(/Flocons d'avoine/)).toBeInTheDocument();
  });

  it("crée le batch (POST) puis redirige vers le détail avec le numéro", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp(["/batches/new/r1"]);

    await user.selectOptions(await screen.findByLabelText(/profil d'équipement/i), "eq1");
    await user.click(screen.getByRole("button", { name: /créer le batch/i }));

    expect(await screen.findByText(/Batch nº 42/)).toBeInTheDocument();
    expect(screen.getAllByText("Réservé")).toHaveLength(2);

    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/batches"));
    expect(post?.body).toMatchObject({ recipeId: "r1", equipmentProfileId: "eq1" });
  });

  it("refuse la planification d'une recette non publiée", async () => {
    recipe = makeRecipe({ status: "DRAFT" });
    installFetch();
    renderApp(["/batches/new/r1"]);

    expect(await screen.findByText(/seule une recette/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /créer le batch/i })).not.toBeInTheDocument();
  });
});

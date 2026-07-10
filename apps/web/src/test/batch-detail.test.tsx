import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { BatchDetail, BatchMeasure, EquipmentProfile } from "@/lib/api";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

const ISO = new Date("2026-07-10T10:00:00Z").toISOString();

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

function makeBatch(): BatchDetail {
  return {
    id: "b1",
    batchNumber: 7,
    recipeId: "r1",
    recipeVersion: 2,
    equipmentProfileId: "eq1",
    status: "PLANIFIE",
    plannedAt: ISO,
    brewedAt: null,
    fermentedAt: null,
    packagedAt: null,
    completedAt: null,
    createdAt: ISO,
    updatedAt: ISO,
    recipeSnapshot: {
      name: "IPA maison",
      steps: [
        { id: "s1", type: "BOIL", name: null, sortOrder: 0, params: { timeMin: 60 } },
        {
          id: "s2",
          type: "FERMENT",
          name: "Primaire",
          sortOrder: 1,
          params: { tempC: 20, days: 14 },
        },
        { id: "s3", type: "CONDITION", name: null, sortOrder: 2, params: { tempC: 4, days: 7 } },
      ],
      ingredients: [{ catalogItemId: "cat-malt", name: "Pale Ale" }],
    },
    reservations: [{ id: "res1", catalogItemId: "cat-malt", quantity: 5000, status: "RESERVED" }],
  };
}

let batch: BatchDetail;
let measures: BatchMeasure[] = [];
let calls: { method: string; url: string; body: unknown }[] = [];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const MILESTONE: Record<string, keyof BatchDetail> = {
  EN_BRASSAGE: "brewedAt",
  EN_FERMENTATION: "fermentedAt",
  EN_CONDITIONNEMENT: "packagedAt",
  TERMINE: "completedAt",
};

function installFetch() {
  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const path = url.split("?")[0] ?? url;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));

    if (/\/api\/equipment-profiles\/[^/]+$/.exec(path) && method === "GET") {
      return Promise.resolve(json(200, { profile: PROFILE }));
    }

    if (/\/api\/batches\/[^/]+\/measures$/.exec(path)) {
      if (method === "GET") return Promise.resolve(json(200, { measures }));
      if (method === "POST") {
        const measure: BatchMeasure = {
          id: `m${measures.length + 1}`,
          type: body.type,
          value: body.value,
          unit: body.unit ?? null,
          phase: body.phase ?? null,
          loggedById: USER.id,
          loggedAt: new Date().toISOString(),
        };
        measures = [...measures, measure];
        return Promise.resolve(json(201, { measure }));
      }
    }

    if (/\/api\/batches\/[^/]+\/status$/.exec(path) && method === "POST") {
      const next = body.status as string;
      batch = { ...batch, status: next as BatchDetail["status"] };
      const field = MILESTONE[next];
      if (field) batch = { ...batch, [field]: new Date().toISOString() };
      return Promise.resolve(json(200, { batch }));
    }

    if (/\/api\/batches\/[^/]+$/.exec(path) && method === "GET") {
      return Promise.resolve(json(200, { batch }));
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
  batch = makeBatch();
  measures = [];
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("détail d'un batch (M3-09)", () => {
  it("affiche le statut et le plan de fermentation dérivé du snapshot", async () => {
    installFetch();
    renderApp(["/batches/b1"]);

    expect(await screen.findByText(/Batch nº 7/)).toBeInTheDocument();
    expect(screen.getByText("Planifié")).toBeInTheDocument();
    // Plan de fermentation : FERMENT + CONDITION (BOIL exclu).
    expect(screen.getByText(/Fermentation/)).toBeInTheDocument();
    expect(screen.getByText(/Primaire/)).toBeInTheDocument();
    expect(screen.getByText("20 °C")).toBeInTheDocument();
    expect(screen.getByText("14 j")).toBeInTheDocument();
    expect(screen.getByText(/Garde/)).toBeInTheDocument();
  });

  it("ajoute une mesure (POST) qui apparaît dans le journal", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp(["/batches/b1"]);

    await screen.findByText(/Batch nº 7/);
    await user.type(screen.getByLabelText("Valeur"), "1.052");
    await user.click(screen.getByRole("button", { name: /ajouter/i }));

    expect(await screen.findByText("1.052 SG")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/measures"));
    expect(post?.body).toMatchObject({ type: "GRAVITY", value: 1.052, unit: "SG" });
  });

  it("fait progresser le statut via une transition autorisée", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    installFetch();
    const user = userEvent.setup();
    renderApp(["/batches/b1"]);

    await screen.findByText(/Batch nº 7/);
    await user.click(screen.getByRole("button", { name: /passer à « en brassage »/i }));

    expect(await screen.findByText("En brassage")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/status"));
    expect(post?.body).toMatchObject({ status: "EN_BRASSAGE" });
  });
});

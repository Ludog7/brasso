import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

const ISO = new Date("2026-07-13T10:00:00Z").toISOString();

const PLAN = [
  { id: "init", phase: "INITIALIZATION", label: "Initialisation", requiresStabilization: false },
  {
    id: "mash-1",
    phase: "MASH",
    label: "Empâtage — palier 1",
    requiresStabilization: true,
    plannedHoldMin: 60,
    plannedRampMin: 15,
    targetTempC: 66,
    requiredMeasurements: ["temperature"],
  },
  { id: "pitching-1", phase: "PITCHING", label: "Ensemencement", requiresStabilization: false },
];

const BATCH = {
  id: "b1",
  batchNumber: 7,
  recipeId: "r1",
  recipeVersion: 2,
  equipmentProfileId: null,
  status: "EN_BRASSAGE",
  plannedAt: ISO,
  brewedAt: ISO,
  fermentedAt: null,
  packagedAt: null,
  completedAt: null,
  createdAt: ISO,
  updatedAt: ISO,
  recipeSnapshot: { name: "IPA maison", steps: [] },
  reservations: [],
};

/** Fabrique une session Jour J à un curseur donné. */
function session(phase: string, cursor: number, completedStepIds: string[], revision: number) {
  return {
    batchStatus: "EN_BRASSAGE",
    phase,
    revision,
    plan: PLAN,
    state: {
      plan: PLAN,
      cursor,
      status: cursor === 0 ? "PENDING" : "AWAITING_STABILIZATION",
      stepStartedAt: null,
      stabilizedAt: null,
      timer: null,
      measurements: [],
      completedStepIds,
    },
    timings: {
      stepId: PLAN[cursor]?.id ?? null,
      phase: PLAN[cursor]?.phase ?? "INITIALIZATION",
      plannedRampMin: null,
      actualRampMin: null,
      plannedHoldMin: null,
      elapsedHoldMin: null,
      holdRemainingMin: null,
      holdOverrunMin: 0,
      holdElapsed: false,
    },
  };
}

let hasSession: boolean;
let calls: { method: string; url: string }[] = [];

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
    calls.push({ method, url });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));

    if (path.endsWith("/api/batches/b1/day/start") && method === "POST") {
      hasSession = true;
      return Promise.resolve(json(201, { day: session("INITIALISATION", 0, [], 0) }));
    }
    if (path.endsWith("/api/batches/b1/day") && method === "GET") {
      return hasSession
        ? Promise.resolve(json(200, { day: session("EMPATAGE", 1, ["init"], 1) }))
        : Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "aucune session" } }));
    }
    if (/\/api\/batches\/[^/]+$/.exec(path) && method === "GET") {
      return Promise.resolve(json(200, { batch: BATCH }));
    }

    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/batches/b1/day"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  hasSession = false;
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("coquille Jour J tablette (M4-08)", () => {
  it("sans session : affiche l'en-tête et un bouton « Démarrer le Jour J »", async () => {
    installFetch();
    renderApp();

    expect(await screen.findByText(/Jour J — Batch nº 7/)).toBeInTheDocument();
    expect(screen.getByText("IPA maison")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /démarrer le jour j/i })).toBeInTheDocument();
  });

  it("démarre la session au clic (POST /day/start) et rend l'état", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("button", { name: /démarrer le jour j/i });
    await user.click(screen.getByRole("button", { name: /démarrer le jour j/i }));

    // La session démarrée est rendue : phase Initialisation + progression.
    expect(await screen.findByRole("heading", { name: "Initialisation" })).toBeInTheDocument();
    expect(screen.getByText("Étape 1 / 3")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/day/start"))).toBe(true);
  });

  it("avec session : en-tête + phase courante + progression du plan", async () => {
    hasSession = true;
    installFetch();
    renderApp();

    expect(await screen.findByRole("heading", { name: "Empâtage" })).toBeInTheDocument();
    // Badge de phase dans l'en-tête + libellé de l'étape courante (sous-titre + liste).
    expect(screen.getAllByText("Empâtage").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Empâtage — palier 1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Étape 2 / 3")).toBeInTheDocument();
  });

  it("indicateur de connexion : bascule en ligne → hors ligne", async () => {
    hasSession = true;
    installFetch();
    renderApp();

    // Cible l'indicateur d'en-tête par son nom accessible : la bannière offline
    // (M4-14) est un second `role="status"` distinct.
    const indicator = await screen.findByRole("status", { name: /connexion/i });
    expect(indicator).toHaveTextContent("En ligne");

    act(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      window.dispatchEvent(new Event("offline"));
    });

    expect(await screen.findByRole("status", { name: /connexion/i })).toHaveTextContent(
      "Hors ligne",
    );
  });
});

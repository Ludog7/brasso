import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { useDayToasts } from "@/features/day/toast";
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
    id: "lauter-1",
    phase: "LAUTER",
    label: "Filtration / Pré-ébullition",
    requiresStabilization: false,
    requiredMeasurements: ["density", "volume"],
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
  // Modèle : OG cible 1.052, volume 20 L (comparés aux mesures pré-ébullition).
  recipeSnapshot: {
    name: "IPA maison",
    steps: [],
    beerDetails: { targetOg: 1.052, targetFg: 1.01, batchVolumeL: 20 },
  },
  reservations: [],
};

interface Measurement {
  kind: string;
  value: number;
  at: number;
  stepId: string;
  source: string;
}

/** Session sur l'étape de filtration/pré-ébullition (cursor 1), mesures contrôlées. */
function lauterSession(measurements: Measurement[]) {
  return {
    batchStatus: "EN_BRASSAGE",
    phase: "FILTRATION",
    revision: 1,
    plan: PLAN,
    state: {
      plan: PLAN,
      cursor: 1,
      status: "AWAITING_VALIDATION",
      stepStartedAt: null,
      stabilizedAt: null,
      timer: null,
      measurements,
      completedStepIds: ["init"],
    },
    timings: null,
  };
}

interface Scenario {
  day: ReturnType<typeof lauterSession>;
  onEvent: (body: { type?: string; kind?: string; value?: number }) => Response;
}
let scenario: Scenario;
let calls: {
  method: string;
  url: string;
  body?: { type?: string; kind?: string; value?: number };
}[] = [];

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
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as { type?: string; kind?: string; value?: number })
        : undefined;
    calls.push({ method, url, body });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));
    if (path.endsWith("/api/batches/b1/day/events") && method === "POST") {
      return Promise.resolve(scenario.onEvent(body ?? {}));
    }
    if (path.endsWith("/api/batches/b1/day") && method === "GET") {
      return Promise.resolve(json(200, { day: scenario.day }));
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
  calls = [];
  useSession.setState({ user: null });
  useDayToasts.setState({ toasts: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saisie de mesures & alertes d'écart Jour J (M4-11)", () => {
  it("la saisie envoie un RECORD_MEASUREMENT (kind/value)", async () => {
    scenario = {
      day: lauterSession([]),
      onEvent: (body) => {
        scenario.day = lauterSession([
          {
            kind: body.kind ?? "density",
            value: body.value ?? 0,
            at: 1,
            stepId: "lauter-1",
            source: "manual",
          },
        ]);
        return json(200, { day: scenario.day });
      },
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText(/valeur relevée/i), "1.03");
    await user.click(screen.getByRole("button", { name: /enregistrer la mesure/i }));

    const posted = calls.find((c) => c.method === "POST" && c.url.endsWith("/day/events"));
    expect(posted?.body).toEqual({ type: "RECORD_MEASUREMENT", kind: "density", value: 1.03 });
  });

  it("mesures requises manquantes → « Valider » non proposé, mesures rappelées", async () => {
    scenario = {
      day: lauterSession([]),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
    renderApp();

    // Le rappel des mesures requises manquantes est affiché…
    expect(await screen.findByText(/mesures requises manquantes/i)).toBeInTheDocument();
    // …et la validation normale n'est pas proposée tant qu'elles manquent.
    expect(screen.queryByRole("button", { name: /valider l'étape/i })).not.toBeInTheDocument();
  });

  it("une mesure hors modèle affiche une alerte d'écart", async () => {
    // Densité pré-ébullition 1.030 vs OG modèle 1.052 → écart signalé.
    scenario = {
      day: lauterSession([
        { kind: "density", value: 1.03, at: 1, stepId: "lauter-1", source: "manual" },
      ]),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
    renderApp();

    // Cible le badge d'écart de mesure (« vs modèle »), distinct du journal d'écart (M4-12).
    const alert = await screen.findByText(/vs modèle/i);
    expect(alert).toHaveTextContent("vs modèle 1.052");
  });

  it("mesures requises complètes → « Valider » proposé et avance", async () => {
    scenario = {
      day: lauterSession([
        { kind: "density", value: 1.05, at: 1, stepId: "lauter-1", source: "manual" },
        { kind: "volume", value: 20, at: 2, stepId: "lauter-1", source: "manual" },
      ]),
      onEvent: () => {
        scenario.day = {
          ...lauterSession([]),
          phase: "ENSEMENCEMENT",
          state: {
            ...lauterSession([]).state,
            cursor: 2,
            status: "PENDING",
            completedStepIds: ["init", "lauter-1"],
          },
        };
        return json(200, { day: scenario.day });
      },
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /valider l'étape/i }));

    const posted = calls.find((c) => c.method === "POST" && c.url.endsWith("/day/events"));
    expect(posted?.body).toEqual({ type: "VALIDATE_STEP" });
    expect(await screen.findByText("Étape 3 / 3")).toBeInTheDocument();
  });
});

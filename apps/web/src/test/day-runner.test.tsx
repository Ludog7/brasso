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

/** Vue de session Jour J à un curseur / statut donnés (miroir de `DaySessionView`). */
function dayView(opts: {
  phase: string;
  cursor: number;
  status: string;
  completedStepIds?: string[];
  revision?: number;
  batchStatus?: string;
}) {
  const {
    phase,
    cursor,
    status,
    completedStepIds = [],
    revision = 0,
    batchStatus = "EN_BRASSAGE",
  } = opts;
  return {
    batchStatus,
    phase,
    revision,
    plan: PLAN,
    state: {
      plan: PLAN,
      cursor,
      status,
      stepStartedAt: null,
      stabilizedAt: null,
      timer: null,
      measurements: [],
      completedStepIds,
    },
    timings: null,
  };
}

interface Scenario {
  day: ReturnType<typeof dayView>;
  onEvent: (body: { type?: string }) => Response;
}
let scenario: Scenario;
let calls: { method: string; url: string; body?: { type?: string } }[] = [];

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
      typeof init?.body === "string" ? (JSON.parse(init.body) as { type?: string }) : undefined;
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

describe("dérouleur d'étapes Jour J (M4-09)", () => {
  it("« Démarrer » sur PENDING envoie START_STEP", async () => {
    scenario = {
      day: dayView({ phase: "INITIALISATION", cursor: 0, status: "PENDING" }),
      onEvent: () => {
        scenario.day = dayView({
          phase: "INITIALISATION",
          cursor: 0,
          status: "AWAITING_VALIDATION",
          revision: 1,
        });
        return json(200, { day: scenario.day });
      },
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /démarrer l'étape/i }));

    const posted = calls.find((c) => c.method === "POST" && c.url.endsWith("/day/events"));
    expect(posted?.body).toEqual({ type: "START_STEP" });
    // L'étape passe « à valider » (état serveur renvoyé).
    expect(await screen.findByRole("button", { name: /valider l'étape/i })).toBeEnabled();
  });

  it("« Valider » sur AWAITING_VALIDATION avance le curseur", async () => {
    scenario = {
      day: dayView({ phase: "INITIALISATION", cursor: 0, status: "AWAITING_VALIDATION" }),
      onEvent: () => {
        scenario.day = dayView({
          phase: "EMPATAGE",
          cursor: 1,
          status: "AWAITING_STABILIZATION",
          completedStepIds: ["init"],
          revision: 1,
        });
        return json(200, { day: scenario.day });
      },
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText("Étape 1 / 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /valider l'étape/i }));

    const posted = calls.find((c) => c.method === "POST" && c.url.endsWith("/day/events"));
    expect(posted?.body).toEqual({ type: "VALIDATE_STEP" });
    // La progression reflète le nouveau curseur : étape 2/3, phase Empâtage courante.
    expect(await screen.findByText("Étape 2 / 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Empâtage" })).toBeInTheDocument();
    const progress = screen.getByRole("list", { name: /progression des phases/i });
    expect(progress.querySelector('[aria-current="step"]')).toHaveTextContent("Empâtage");
  });

  it("un rejet (409) est affiché en toast sans avancer l'étape", async () => {
    scenario = {
      day: dayView({ phase: "EMPATAGE", cursor: 1, status: "AWAITING_VALIDATION" }),
      onEvent: () =>
        json(409, {
          error: {
            code: "DAY_EVENT_REJECTED",
            message: "Mesures requises manquantes : temperature.",
          },
        }),
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /valider l'étape/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mesures requises manquantes : temperature.",
    );
    // État inchangé : toujours sur l'étape 2/3.
    expect(screen.getByText("Étape 2 / 3")).toBeInTheDocument();
  });

  it("valide la dernière étape → écran de fin vers la fiche batch", async () => {
    scenario = {
      day: dayView({ phase: "ENSEMENCEMENT", cursor: 2, status: "AWAITING_VALIDATION" }),
      onEvent: () => {
        scenario.day = dayView({
          phase: "TERMINE",
          cursor: 3,
          status: "COMPLETED",
          completedStepIds: ["init", "mash-1", "pitching-1"],
          revision: 1,
          batchStatus: "EN_FERMENTATION",
        });
        return json(200, { day: scenario.day });
      },
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /valider l'étape/i }));

    expect(await screen.findByRole("heading", { name: "Brassin terminé" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /voir le détail du batch/i });
    expect(link).toHaveAttribute("href", "/batches/b1");
  });

  it("statut intermédiaire : action désactivée + indication", async () => {
    scenario = {
      day: dayView({ phase: "EMPATAGE", cursor: 1, status: "AWAITING_STABILIZATION" }),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
    renderApp();

    expect(await screen.findByRole("button", { name: /valider l'étape/i })).toBeDisabled();
    expect(screen.getByText(/stabilisation de température/i)).toBeInTheDocument();
  });
});

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
    requiredMeasurements: [],
  },
  { id: "pitching-1", phase: "PITCHING", label: "Ensemencement", requiresStabilization: false },
];

const MS_PER_MIN = 60_000;

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

/** Session Jour J sur l'étape d'empâtage (cursor 1), état partiel contrôlé. */
function mashSession(state: {
  status: string;
  stepStartedAt?: number | null;
  stabilizedAt?: number | null;
  timer?: { stepId: string; startedAt: number; plannedHoldMin: number } | null;
}) {
  return {
    batchStatus: "EN_BRASSAGE",
    phase: "EMPATAGE",
    revision: 1,
    plan: PLAN,
    state: {
      plan: PLAN,
      cursor: 1,
      status: state.status,
      stepStartedAt: state.stepStartedAt ?? null,
      stabilizedAt: state.stabilizedAt ?? null,
      timer: state.timer ?? null,
      measurements: [],
      completedStepIds: ["init"],
    },
    timings: null,
  };
}

interface Scenario {
  day: ReturnType<typeof mashSession>;
  onEvent: (body: { type?: string; temperatureC?: number }) => Response;
}
let scenario: Scenario;
let calls: { method: string; url: string; body?: { type?: string; temperatureC?: number } }[] = [];

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
        ? (JSON.parse(init.body) as { type?: string; temperatureC?: number })
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

describe("timers de palier & rampe Jour J (M4-10)", () => {
  it("avant stabilisation : aucun compte à rebours, bouton « Confirmer la stabilisation »", async () => {
    scenario = {
      day: mashSession({ status: "AWAITING_STABILIZATION", stepStartedAt: Date.now() }),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
    renderApp();

    expect(
      await screen.findByRole("button", { name: /confirmer la stabilisation/i }),
    ).toBeInTheDocument();
    // Feature sanctuarisée : pas de timer tant que la stabilisation n'est pas confirmée.
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("confirmer (avec température) arme le timer et affiche le compte à rebours", async () => {
    scenario = {
      day: mashSession({ status: "AWAITING_STABILIZATION", stepStartedAt: Date.now() }),
      onEvent: () => {
        const startedAt = Date.now();
        scenario.day = mashSession({
          status: "TIMER_RUNNING",
          stepStartedAt: startedAt - 12 * MS_PER_MIN,
          stabilizedAt: startedAt,
          timer: { stepId: "mash-1", startedAt, plannedHoldMin: 60 },
        });
        return json(200, { day: scenario.day });
      },
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText(/température relevée/i), "65");
    await user.click(screen.getByRole("button", { name: /confirmer la stabilisation/i }));

    const posted = calls.find((c) => c.method === "POST" && c.url.endsWith("/day/events"));
    expect(posted?.body).toEqual({ type: "CONFIRM_STABILIZATION", temperatureC: 65 });
    // Le timer est désormais armé : compte à rebours visible, palier non écoulé.
    expect(await screen.findByRole("timer")).toBeInTheDocument();
    expect(screen.getByText(/sur 60 min/i)).toBeInTheDocument();
  });

  it("palier écoulé : dépassement signalé et « Valider » actif → avance", async () => {
    const startedAt = Date.now() - 70 * MS_PER_MIN; // 70 min écoulés sur un palier de 60
    scenario = {
      day: mashSession({
        status: "TIMER_RUNNING",
        stepStartedAt: startedAt - 15 * MS_PER_MIN,
        stabilizedAt: startedAt,
        timer: { stepId: "mash-1", startedAt, plannedHoldMin: 60 },
      }),
      onEvent: () => {
        scenario.day = {
          ...mashSession({ status: "PENDING" }),
          phase: "ENSEMENCEMENT",
          state: {
            ...mashSession({ status: "PENDING" }).state,
            cursor: 2,
            completedStepIds: ["init", "mash-1"],
          },
        };
        return json(200, { day: scenario.day });
      },
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText(/dépassement/i)).toBeInTheDocument();
    const validate = screen.getByRole("button", { name: /valider l'étape/i });
    expect(validate).toBeEnabled();

    await user.click(validate);
    const posted = calls.find((c) => c.method === "POST" && c.url.endsWith("/day/events"));
    expect(posted?.body).toEqual({ type: "VALIDATE_STEP" });
    // On avance à l'étape suivante (ensemencement, 3/3).
    expect(await screen.findByText("Étape 3 / 3")).toBeInTheDocument();
  });

  it("affiche la montée en chauffe estimée vs réelle", async () => {
    const startedAt = Date.now();
    scenario = {
      day: mashSession({
        status: "TIMER_RUNNING",
        stepStartedAt: startedAt - 12 * MS_PER_MIN, // rampe réelle = 12 min
        stabilizedAt: startedAt,
        timer: { stepId: "mash-1", startedAt, plannedHoldMin: 60 },
      }),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
    renderApp();

    expect(await screen.findByText("Montée estimée")).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument(); // plannedRampMin
    expect(screen.getByText("Montée réelle")).toBeInTheDocument();
    expect(screen.getByText("12 min")).toBeInTheDocument(); // actualRampMin
  });
});

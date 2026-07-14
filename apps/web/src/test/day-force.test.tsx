import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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

const ISO = new Date("2026-07-14T10:00:00Z").toISOString();

const PLAN = [
  { id: "init", phase: "INITIALIZATION", label: "Initialisation", requiresStabilization: false },
  {
    id: "mash-1",
    phase: "MASH",
    label: "Empâtage — palier 1",
    requiresStabilization: true,
    plannedHoldMin: 60,
    targetTempC: 66,
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
function dayView(opts: { phase: string; cursor: number; status: string; revision?: number }) {
  const { phase, cursor, status, revision = 0 } = opts;
  return {
    batchStatus: "EN_BRASSAGE",
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
      completedStepIds: [],
    },
    timings: null,
  };
}

interface Deviation {
  id: string;
  step: string;
  phase: string | null;
  reason: string;
  author: string | null;
  forcedFromStatus: string | null;
  occurredAt: string;
}

interface Scenario {
  day: ReturnType<typeof dayView>;
  deviations: Deviation[];
  onForce: (body: { reason?: string; author?: string }) => Response;
}
let scenario: Scenario;
let calls: { method: string; url: string; body?: { type?: string; reason?: string } }[] = [];

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
        ? (JSON.parse(init.body) as { type?: string; reason?: string; author?: string })
        : undefined;
    calls.push({ method, url, body });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));

    if (path.endsWith("/api/batches/b1/day/deviations") && method === "GET") {
      return Promise.resolve(json(200, { deviations: scenario.deviations }));
    }
    if (path.endsWith("/api/batches/b1/day/events") && method === "POST") {
      return Promise.resolve(scenario.onForce(body ?? {}));
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
  useSession.setState({ user: USER });
  useDayToasts.setState({ toasts: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mode manuel « Forcer l'étape » (M4-12)", () => {
  it("la modale exige un motif : confirmer est impossible tant qu'il est vide", async () => {
    scenario = {
      day: dayView({ phase: "INITIALISATION", cursor: 0, status: "PENDING" }),
      deviations: [],
      onForce: () => json(200, { day: scenario.day }),
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /forcer l'étape/i }));

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: /confirmer le forçage/i });
    // Motif vide → action à conséquence bloquée.
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/motif du forçage/i), "sonde HS");
    expect(confirm).toBeEnabled();
  });

  it("confirmer envoie FORCE_STEP{author,reason} et l'entrée apparaît au journal", async () => {
    scenario = {
      day: dayView({ phase: "INITIALISATION", cursor: 0, status: "PENDING" }),
      deviations: [],
      onForce: (b) => {
        // Le serveur trace l'écart puis renvoie la session avancée (init → mash-1).
        scenario.deviations = [
          {
            id: "d1",
            step: "init",
            phase: "INITIALISATION",
            reason: b.reason ?? "",
            author: "Brasseur Test",
            forcedFromStatus: "PENDING",
            occurredAt: ISO,
          },
        ];
        scenario.day = dayView({
          phase: "EMPATAGE",
          cursor: 1,
          status: "AWAITING_STABILIZATION",
          revision: 1,
        });
        return json(200, { day: scenario.day });
      },
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    // Journal vide au départ.
    expect(await screen.findByText(/aucun écart pour l'instant/i)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /forcer l'étape/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/motif du forçage/i), "sonde de température HS");
    await user.click(within(dialog).getByRole("button", { name: /confirmer le forçage/i }));

    // La requête porte le type, l'auteur (utilisateur courant) et le motif.
    const posted = calls.find((c) => c.method === "POST" && c.url.endsWith("/day/events"));
    expect(posted?.body).toEqual({
      type: "FORCE_STEP",
      author: "Brasseur Test",
      reason: "sonde de température HS",
    });

    // La modale se ferme et l'écart apparaît au journal (lecture du batch).
    const journal = screen.getByRole("region", { name: /journal des écarts/i });
    expect(await within(journal).findByText("sonde de température HS")).toBeInTheDocument();
    expect(within(journal).getByText(/brasseur test/i)).toBeInTheDocument();
  });

  it("le journal liste les écarts existants en lecture seule", async () => {
    scenario = {
      day: dayView({ phase: "EMPATAGE", cursor: 1, status: "AWAITING_STABILIZATION" }),
      deviations: [
        {
          id: "d1",
          step: "init",
          phase: "INITIALISATION",
          reason: "oubli de validation",
          author: "Brasseur Test",
          forcedFromStatus: "PENDING",
          occurredAt: ISO,
        },
      ],
      onForce: () => json(200, { day: scenario.day }),
    };
    installFetch();
    renderApp();

    const journal = await screen.findByRole("region", { name: /journal des écarts/i });
    expect(await within(journal).findByText("oubli de validation")).toBeInTheDocument();
    // Lecture seule : aucun contrôle interactif dans le journal.
    expect(within(journal).queryAllByRole("button")).toHaveLength(0);
    expect(within(journal).queryAllByRole("textbox")).toHaveLength(0);
  });
});

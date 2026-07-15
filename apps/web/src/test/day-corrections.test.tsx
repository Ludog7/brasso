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

const ISO = new Date("2026-07-15T10:00:00Z").toISOString();

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
  recipeSnapshot: {
    name: "IPA maison",
    steps: [],
    beerDetails: { targetOg: 1.05, targetFg: 1.012, boilTimeMin: 60, batchVolumeL: 26 },
  },
  reservations: [],
};

/** Densité basse (1.036) + volume relevés à la filtration → aperçu déclenché. */
const LAUTER_SESSION = {
  batchStatus: "EN_BRASSAGE",
  phase: "FILTRATION",
  revision: 2,
  plan: PLAN,
  state: {
    plan: PLAN,
    cursor: 1,
    status: "AWAITING_VALIDATION",
    stepStartedAt: null,
    stabilizedAt: null,
    timer: null,
    measurements: [
      { kind: "density", value: 1.036, at: 1, stepId: "lauter-1", source: "manual" },
      { kind: "volume", value: 30, at: 2, stepId: "lauter-1", source: "manual" },
    ],
    completedStepIds: ["init"],
  },
  timings: null,
};

/** Aperçu serveur pour une densité basse (M4-07 → core M4-02) : deux leviers chiffrés. */
const PREVIEW = {
  deltaGravity: -7.33,
  deltaOg: -8.46,
  proposals: [
    { kind: "extend_boil", extraBoilMin: 66, projectedOg: 1.05, projectedAbv: 4.92 },
    { kind: "add_sugar", sugarKg: 4.78, projectedOg: 1.05, projectedAbv: 4.92 },
  ],
};

let calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];

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
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    calls.push({ method, url, body });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));
    if (path.endsWith("/day/corrections/preview") && method === "POST") {
      return Promise.resolve(json(200, { preview: PREVIEW }));
    }
    if (path.endsWith("/day/corrections") && method === "POST") {
      return Promise.resolve(
        json(201, {
          correction: {
            id: "corr-1",
            stepId: body?.stepId,
            type: body?.type,
            payload: body?.payload,
            authorId: "u1",
            createdAt: ISO,
          },
        }),
      );
    }
    if (path.endsWith("/day/deviations") && method === "GET") {
      return Promise.resolve(json(200, { deviations: [] }));
    }
    if (path.endsWith("/api/batches/b1/day") && method === "GET") {
      return Promise.resolve(json(200, { day: LAUTER_SESSION }));
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

describe("corrections densité pré-ébullition Jour J (M4-13)", () => {
  it("densité basse → propositions chiffrées avec impact OG/ABV estimé", async () => {
    installFetch();
    renderApp();

    const panel = (await screen.findByRole("region", {
      name: /corrections densité pré-ébullition/i,
    })) as HTMLElement;

    // Prolonger l'ébullition : action + impact estimé.
    expect(
      await within(panel).findByText(/prolonger l'ébullition de \+66 min/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/ajouter \+4\.78 kg de sucre/i)).toBeInTheDocument();
    // Impact chiffré (OG 3 décimales, ABV 1 décimale).
    const impacts = within(panel).getAllByText(/OG estimée ≈ 1\.050 · ABV estimé ≈ 4\.9 %/);
    expect(impacts).toHaveLength(2);

    // L'aperçu a bien été demandé au serveur avec les mesures relevées.
    const previewCall = calls.find((c) => c.url.endsWith("/day/corrections/preview"));
    expect(previewCall?.body).toEqual({ measuredGravity: 1.036, measuredVolumeL: 30 });
  });

  it("« Enregistrer la décision » journalise la décision retenue (type + payload)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const panel = (await screen.findByRole("region", {
      name: /corrections densité pré-ébullition/i,
    })) as HTMLElement;
    const buttons = await within(panel).findAllByRole("button", {
      name: /enregistrer la décision/i,
    });
    await user.click(buttons[0] as HTMLElement);

    const posted = calls.find((c) => c.method === "POST" && c.url.endsWith("/day/corrections"));
    expect(posted?.body).toEqual({
      stepId: "lauter-1",
      type: "EXTEND_BOIL",
      payload: { kind: "extend_boil", extraBoilMin: 66, projectedOg: 1.05, projectedAbv: 4.92 },
    });

    // Trace visible : la décision enregistrée est confirmée à l'écran.
    expect(await within(panel).findByText(/décision enregistrée/i)).toBeInTheDocument();
  });

  it("wording d'aide à la décision (ADR-11) — jamais prescriptif", async () => {
    installFetch();
    renderApp();

    const panel = (await screen.findByRole("region", {
      name: /corrections densité pré-ébullition/i,
    })) as HTMLElement;
    // Attendre le rendu complet (propositions résolues) avant de juger le wording.
    await within(panel).findByText(/prolonger l'ébullition de \+66 min/i);
    expect(
      within(panel).getByText(/estimations indicatives d'aide à la décision/i),
    ).toBeInTheDocument();
    // Aucun vocabulaire prescriptif / de garantie (ADR-11).
    expect(panel.textContent ?? "").not.toMatch(/conforme|garantit|corrige\b/i);
  });
});

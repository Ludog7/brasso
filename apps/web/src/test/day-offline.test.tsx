import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { clearQueue, countPending } from "@/features/day/offline/queue";
import { useDayToasts } from "@/features/day/toast";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "b@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};
const ISO = new Date("2026-07-14T10:00:00Z").toISOString();

const PLAN = [
  { id: "init", phase: "INITIALIZATION", label: "Initialisation", requiresStabilization: false },
  { id: "mash-1", phase: "MASH", label: "Empâtage", requiresStabilization: true, targetTempC: 66 },
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

/** Session Jour J à un curseur / statut donné (miroir de `DaySessionView`). */
function dayView(opts: {
  phase: string;
  cursor: number;
  status: string;
  completedStepIds?: string[];
  revision?: number;
}) {
  const { phase, cursor, status, completedStepIds = [], revision = 0 } = opts;
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
      completedStepIds,
    },
    timings: null,
  };
}

// Session serveur après rejeu des 2 actions (init démarré puis validé → mash-1).
const AFTER_SYNC = dayView({
  phase: "EMPATAGE",
  cursor: 1,
  status: "PENDING",
  completedStepIds: ["init"],
  revision: 2,
});

interface Scenario {
  day: ReturnType<typeof dayView>;
}
let scenario: Scenario;
let syncCalls: { clientEventId: string; event: { type?: string; at?: number } }[][] = [];
let eventCalls: number;

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

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));
    if (path.endsWith("/api/batches/b1/day/deviations") && method === "GET") {
      return Promise.resolve(json(200, { deviations: [] }));
    }
    if (path.endsWith("/api/batches/b1/day/events:sync") && method === "POST") {
      const events = (body?.events ?? []) as {
        clientEventId: string;
        event: { type?: string; at?: number };
      }[];
      syncCalls.push(events);
      // Le serveur applique la file et devient la source de vérité (état avancé).
      scenario.day = AFTER_SYNC;
      const results = events.map((e) => ({ clientEventId: e.clientEventId, outcome: "applied" }));
      return Promise.resolve(json(200, { day: { ...AFTER_SYNC, results } }));
    }
    if (path.endsWith("/api/batches/b1/day/events") && method === "POST") {
      eventCalls += 1; // ne doit jamais arriver hors-ligne
      return Promise.resolve(json(200, { day: scenario.day }));
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
  const client = new QueryClient({
    // Pas de refetch au reconnect : la resync (`:sync`) est la seule autorité au retour en ligne.
    defaultOptions: { queries: { retry: false, refetchOnReconnect: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/batches/b1/day"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let onlineFlag = true;
function setOnline(value: boolean): void {
  onlineFlag = value;
  // `navigator.onLine` (lu par `useOnlineStatus` et le chemin offline) **et** le
  // `onlineManager` de TanStack (pause/reprise des requêtes) doivent être cohérents.
  onlineManager.setOnline(value);
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

beforeAll(() => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onlineFlag });
});

beforeEach(async () => {
  onlineFlag = true;
  // `onlineManager` est un singleton global : le remettre en ligne entre les cas
  // (sinon un test hors-ligne laisse les requêtes du suivant en pause).
  onlineManager.setOnline(true);
  syncCalls = [];
  eventCalls = 0;
  useSession.setState({ user: USER });
  useDayToasts.setState({ toasts: [] });
  await clearQueue();
  scenario = { day: dayView({ phase: "INITIALISATION", cursor: 0, status: "PENDING" }) };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("file d'actions offline Jour J (M4-14)", () => {
  it("hors-ligne : les actions sont mises en file (pas d'envoi) et la bannière les compte", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    // Session chargée en ligne, puis coupure réseau.
    await screen.findByRole("button", { name: /démarrer l'étape/i });
    setOnline(false);

    // Deux actions déroulées hors-ligne (démarrer puis valider l'étape init).
    await user.click(screen.getByRole("button", { name: /démarrer l'étape/i }));
    await user.click(await screen.findByRole("button", { name: /valider l'étape/i }));

    // Rien n'a été envoyé au serveur en événement unitaire…
    expect(eventCalls).toBe(0);
    // …les 2 actions sont dans la file locale…
    await waitFor(async () => expect(await countPending("b1")).toBe(2));
    // …et la bannière hors-ligne les compte.
    expect(await screen.findByText(/hors-ligne — 2 actions en attente/i)).toBeInTheDocument();
    // L'UI a avancé de façon optimiste (étape 2/3, empâtage).
    expect(screen.getByText("Étape 2 / 3")).toBeInTheDocument();
  });

  it("reconnexion : la file est rejouée via :sync, purgée, et le rejeu est idempotent", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("button", { name: /démarrer l'étape/i });
    setOnline(false);
    await user.click(screen.getByRole("button", { name: /démarrer l'étape/i }));
    await user.click(await screen.findByRole("button", { name: /valider l'étape/i }));
    await waitFor(async () => expect(await countPending("b1")).toBe(2));

    // Retour en ligne → resync.
    setOnline(true);

    // Un seul appel `:sync`, portant les 2 événements (avec leur `at` capté hors-ligne).
    await waitFor(() => expect(syncCalls).toHaveLength(1));
    expect(syncCalls[0]).toHaveLength(2);
    expect(syncCalls[0]?.every((e) => typeof e.event.at === "number")).toBe(true);
    expect(syncCalls[0]?.map((e) => e.event.type)).toEqual(["START_STEP", "VALIDATE_STEP"]);

    // File purgée + bannière disparue.
    await waitFor(async () => expect(await countPending("b1")).toBe(0));
    await waitFor(() => expect(screen.queryByText(/en attente/i)).not.toBeInTheDocument());

    // Idempotence : un nouvel événement `online` ne renvoie rien (file déjà vide).
    setOnline(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(syncCalls).toHaveLength(1);
    // Aucun doublon (pas de POST `/day/events` unitaire pendant tout le parcours).
    expect(eventCalls).toBe(0);
  });
});

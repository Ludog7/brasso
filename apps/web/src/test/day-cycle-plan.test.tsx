/**
 * Saisie des **durées prévisionnelles du cycle** en fin d'ensemencement (M9-12).
 *
 * L'écran est monté via `App` sur la route Jour J : c'est le seul moyen de
 * vérifier ce qui fait la valeur du ticket — que la validation de l'étape
 * d'ensemencement passe bien par cette saisie **avant** de clore le Jour J.
 */

import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { clearQueue, countPending } from "@/features/day/offline/queue";
import { useDayToasts } from "@/features/day/toast";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

const ISO = new Date("2026-03-01T09:00:00Z").toISOString();

/**
 * Instant d'ensemencement **figé** : le dialogue lit `Date.now()` pour dater
 * l'aperçu (l'ensemencement, c'est maintenant). Sans horloge fixe, les dates
 * attendues dépendraient du jour où la CI tourne.
 */
const PITCHED_AT = new Date("2026-03-01T09:00:00Z").getTime();

const PLAN = [
  { id: "init", phase: "INITIALIZATION", label: "Initialisation", requiresStabilization: false },
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

/** Session Jour J posée sur l'ensemencement, prête à valider. */
const PITCHING_DAY = {
  batchStatus: "EN_BRASSAGE",
  phase: "ENSEMENCEMENT",
  revision: 1,
  plan: PLAN,
  state: {
    plan: PLAN,
    cursor: 1,
    status: "AWAITING_VALIDATION",
    stepStartedAt: null,
    stabilizedAt: null,
    timer: null,
    measurements: [],
    completedStepIds: ["init"],
  },
  timings: null,
};

interface CycleDefaults {
  timezone: string;
  fermentationDays: number;
  dryHopDays: number;
  coldCrashDays: number;
  gardeDays: number;
  hasDryHop: boolean;
}

let defaults: CycleDefaults;
/** Autre que 200 = la route des défauts échoue (API indisponible). */
let defaultsStatus: number;
/** Autre que 201 = la création de la séquence est refusée par le serveur. */
let planStatus: number;
let calls: { method: string; url: string; body?: Record<string, unknown> }[];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const path = url.split("?")[0] ?? url;
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      calls.push({ method, url, body });

      // Hors ligne : le client ne doit ni joindre ni « réussir » une requête.
      if (!navigator.onLine) return Promise.reject(new TypeError("Failed to fetch"));

      if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));
      if (path.endsWith("/cycle-defaults")) {
        return Promise.resolve(
          defaultsStatus === 200
            ? json(200, { defaults })
            : json(defaultsStatus, { error: { code: "OOPS", message: "ko" } }),
        );
      }
      if (path.endsWith("/milestones") && method === "POST") {
        return Promise.resolve(
          planStatus === 201
            ? json(201, { milestones: [], created: true })
            : json(planStatus, { error: { code: "KO", message: "refusé" } }),
        );
      }
      if (path.endsWith("/milestones") && method === "GET") {
        return Promise.resolve(json(200, { milestones: [] }));
      }
      if (path.endsWith("/day/events") && method === "POST") {
        return Promise.resolve(json(200, { day: PITCHING_DAY }));
      }
      if (path.endsWith("/day/events:sync") && method === "POST") {
        return Promise.resolve(json(200, { day: { ...PITCHING_DAY, results: [] } }));
      }
      if (path.endsWith("/api/batches/b1/day") && method === "GET") {
        return Promise.resolve(json(200, { day: PITCHING_DAY }));
      }
      if (/\/api\/batches\/[^/]+$/.exec(path) && method === "GET") {
        return Promise.resolve(json(200, { batch: BATCH }));
      }
      return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
    }),
  );
}

function renderDay() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/batches/b1/day"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Ouvre la saisie du cycle en validant l'étape d'ensemencement. */
async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /valider l'étape/i }));
  return screen.findByRole("dialog");
}

/** Remplace le contenu d'un champ de durée. */
async function setDuration(user: ReturnType<typeof userEvent.setup>, label: RegExp, value: string) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  if (value !== "") await user.type(field, value);
}

let onlineFlag = true;
function setOnline(value: boolean) {
  onlineFlag = value;
  onlineManager.setOnline(value);
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

beforeAll(() => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onlineFlag });
});

beforeEach(async () => {
  calls = [];
  onlineFlag = true;
  onlineManager.setOnline(true);
  defaultsStatus = 200;
  planStatus = 201;
  defaults = {
    timezone: "Europe/Paris",
    fermentationDays: 14,
    dryHopDays: 3,
    coldCrashDays: 2,
    gardeDays: 21,
    hasDryHop: false,
  };
  useSession.setState({ user: null });
  useDayToasts.setState({ toasts: [] });
  await clearQueue();
  installFetch();
  // Seul `Date.now` est figé (et non des timers factices) : `waitFor` et
  // `userEvent` continuent de tourner sur l'horloge réelle.
  vi.spyOn(Date, "now").mockReturnValue(PITCHED_AT);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saisie des durées de cycle en fin d'ensemencement (M9-12)", () => {
  it("la validation de l'ensemencement ouvre la saisie avant de clore le Jour J", async () => {
    const user = userEvent.setup();
    renderDay();

    await openDialog(user);

    expect(screen.getByRole("heading", { name: /planifier le cycle/i })).toBeInTheDocument();
    // Le Jour J n'est pas clos tant que la saisie n'est pas franchie.
    expect(calls.some((c) => c.url.endsWith("/day/events"))).toBe(false);
  });

  it("pré-remplit les durées depuis les réglages de l'instance", async () => {
    defaults = { ...defaults, fermentationDays: 10, coldCrashDays: 1, gardeDays: 30 };
    const user = userEvent.setup();
    renderDay();

    await openDialog(user);

    expect(screen.getByLabelText(/fermentation/i)).toHaveValue(10);
    expect(screen.getByLabelText(/cold crash/i)).toHaveValue(1);
    expect(screen.getByLabelText(/garde/i)).toHaveValue(30);
  });

  it("valide en une action avec les défauts : durées envoyées puis étape close", async () => {
    const user = userEvent.setup();
    renderDay();

    await openDialog(user);
    await user.click(screen.getByRole("button", { name: /valider et planifier/i }));

    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/day/events"))).toBe(true);
    });
    const planned = calls.find((c) => c.method === "POST" && c.url.endsWith("/milestones"));
    expect(planned?.body).toMatchObject({
      fermentationDays: 14,
      coldCrashDays: 2,
      gardeDays: 21,
    });
    // `pitchedAt` part avec la saisie : c'est lui qui date le cycle.
    expect(typeof planned?.body?.pitchedAt).toBe("string");
    // La séquence est planifiée **avant** que l'étape soit close.
    const order = calls.filter((c) => c.method === "POST").map((c) => c.url);
    expect(order.findIndex((u) => u.endsWith("/milestones"))).toBeLessThan(
      order.findIndex((u) => u.endsWith("/day/events")),
    );
  });

  describe("aperçu daté (§D)", () => {
    it("affiche les dates calculées et la fin prévue du brassin", async () => {
      const user = userEvent.setup();
      renderDay();
      await openDialog(user);

      // 1er mars + 14 + 2 + 21 = 37 j → 7 avril (arithmétique calendaire de `core`).
      expect(screen.getByText(/fin prévue du brassin/i).parentElement).toHaveTextContent(
        "7 avr. 2026",
      );
    });

    it("recalcule en direct à chaque changement de durée", async () => {
      const user = userEvent.setup();
      renderDay();
      await openDialog(user);

      const before = screen.getByText(/fin prévue du brassin/i).parentElement?.textContent;
      await setDuration(user, /garde/i, "31");
      const after = screen.getByText(/fin prévue du brassin/i).parentElement?.textContent;

      // Garde 21 → 31 j : la fin prévue recule de dix jours (7 → 17 avril).
      expect(after).not.toBe(before);
      expect(after).toContain("17 avr. 2026");
    });
  });

  describe("champ dry hop conditionnel (§C)", () => {
    it("est absent quand la recette n'en porte pas", async () => {
      const user = userEvent.setup();
      renderDay();
      await openDialog(user);

      expect(screen.queryByLabelText(/dry hop/i)).not.toBeInTheDocument();
    });

    it("est présent — et compté dans l'aperçu — quand la recette en porte un", async () => {
      defaults = { ...defaults, hasDryHop: true };
      const user = userEvent.setup();
      renderDay();
      const dialog = await openDialog(user);

      expect(screen.getByLabelText(/dry hop/i)).toHaveValue(3);
      expect(within(dialog).getByText(/dry hop · 3 j/i)).toBeInTheDocument();
      // 14 + 3 + 2 + 21 = 40 j → 10 avril.
      expect(screen.getByText(/fin prévue du brassin/i).parentElement).toHaveTextContent(
        "10 avr. 2026",
      );
    });
  });

  it("une durée à 0 retire le jalon de l'aperçu, en le disant", async () => {
    const user = userEvent.setup();
    renderDay();
    const dialog = await openDialog(user);

    expect(within(dialog).getByText(/cold crash · 2 j/i)).toBeInTheDocument();
    await setDuration(user, /cold crash/i, "0");

    expect(within(dialog).queryByText(/cold crash · /i)).not.toBeInTheDocument();
    // Le comportement est annoncé : sans cela, il se lirait comme un bug.
    expect(within(dialog).getByText(/ce jalon ne sera pas créé/i)).toBeInTheDocument();
  });

  describe("bornes de saisie", () => {
    it("refuse une durée au-delà de la borne haute, avec message", async () => {
      const user = userEvent.setup();
      renderDay();
      await openDialog(user);

      await setDuration(user, /garde/i, "400");

      expect(screen.getByRole("button", { name: /valider et planifier/i })).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(/entre 0 et 365/);
    });

    it("refuse un champ vidé, sans écrêter en silence", async () => {
      const user = userEvent.setup();
      renderDay();
      await openDialog(user);

      await setDuration(user, /fermentation/i, "");

      expect(screen.getByRole("button", { name: /valider et planifier/i })).toBeDisabled();
      expect(calls.some((c) => c.url.endsWith("/milestones"))).toBe(false);
    });
  });

  it("sans défauts lisibles, propose de clore sans planifier plutôt que d'inventer des durées", async () => {
    defaultsStatus = 500;
    const user = userEvent.setup();
    renderDay();

    await openDialog(user);
    await user.click(await screen.findByRole("button", { name: /clore sans planifier/i }));

    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/day/events"))).toBe(true);
    });
    // Aucune durée inventée côté front (ADR-01).
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/milestones"))).toBe(false);
  });

  it("« Revenir à l'étape » referme sans rien envoyer", async () => {
    const user = userEvent.setup();
    renderDay();

    await openDialog(user);
    await user.click(screen.getByRole("button", { name: /revenir à l'étape/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("saisie hors ligne : mise en file, puis rejouée à la reconnexion (§F, ADR-08)", async () => {
    const user = userEvent.setup();
    renderDay();
    // Les défauts sont chargés tant qu'on est en ligne — c'est ce qui permet
    // de pré-remplir une saisie qui interviendra peut-être hors couverture.
    await screen.findByRole("button", { name: /valider l'étape/i });
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/cycle-defaults"))).toBe(true));

    setOnline(false);
    await openDialog(user);
    await setDuration(user, /garde/i, "28");
    await user.click(screen.getByRole("button", { name: /valider et planifier/i }));

    // Rien n'est parti sur le réseau, mais rien n'est perdu.
    await waitFor(async () => expect(await countPending("b1")).toBeGreaterThan(0));
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/milestones"))).toBe(false);

    setOnline(true);

    await waitFor(() => {
      const replayed = calls.find((c) => c.method === "POST" && c.url.endsWith("/milestones"));
      expect(replayed?.body).toMatchObject({ gardeDays: 28 });
    });
    // La file est purgée : le rejeu ne doit pas repartir à chaque reconnexion.
    await waitFor(async () => expect(await countPending("b1")).toBe(0));
  });

  it("le `pitchedAt` rejoué est celui de la saisie, pas celui de la reconnexion", async () => {
    const user = userEvent.setup();
    renderDay();
    await screen.findByRole("button", { name: /valider l'étape/i });
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/cycle-defaults"))).toBe(true));

    setOnline(false);
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: /valider et planifier/i }));
    await waitFor(async () => expect(await countPending("b1")).toBeGreaterThan(0));

    // Reconnexion « le lendemain » : dater le cycle de cet instant décalerait
    // tous les jalons d'une journée.
    vi.spyOn(Date, "now").mockReturnValue(PITCHED_AT + 86_400_000);
    setOnline(true);

    await waitFor(() => {
      const replayed = calls.find((c) => c.method === "POST" && c.url.endsWith("/milestones"));
      expect(replayed?.body?.pitchedAt).toBe(new Date(PITCHED_AT).toISOString());
    });
  });

  it("un refus serveur au rejeu purge la file et le signale, plutôt que de boucler", async () => {
    const user = userEvent.setup();
    renderDay();
    await screen.findByRole("button", { name: /valider l'étape/i });
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/cycle-defaults"))).toBe(true));

    setOnline(false);
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: /valider et planifier/i }));
    await waitFor(async () => expect(await countPending("b1")).toBeGreaterThan(0));

    planStatus = 409;
    setOnline(true);

    await waitFor(async () => expect(await countPending("b1")).toBe(0));
    expect(
      useDayToasts
        .getState()
        .toasts.map((t) => t.message)
        .join(" "),
    ).toMatch(/planification du cycle refusée/i);
  });
});

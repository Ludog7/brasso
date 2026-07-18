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

const ISO = new Date("2026-07-18T08:00:00Z").toISOString();

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

/** Étape de filtration : aucune barrière temporelle, deux mesures requises. */
const LAUTER = {
  id: "lauter-1",
  phase: "LAUTER",
  label: "Filtration / Pré-ébullition",
  requiresStabilization: false,
  requiredMeasurements: ["density", "volume"],
};

/** Refroidissement : la cible doit être **atteinte par le bas** pour enchaîner. */
const COOLING = {
  id: "cooling-1",
  phase: "COOLING",
  label: "Refroidissement",
  requiresStabilization: true,
  targetTempC: 20,
  targetTempConstraint: "at_most",
  requiredMeasurements: ["temperature"],
};

const SANITIZE = {
  id: "boil-sanitize-1",
  phase: "BOIL",
  label: "Assainissement du circuit de refroidissement",
  requiresStabilization: false,
  plannedHoldMin: 5,
  targetTempC: 100,
};

const WHIRLPOOL = {
  id: "whirlpool-1",
  phase: "WHIRLPOOL",
  label: "Whirlpool",
  requiresStabilization: false,
  plannedHoldMin: 15,
};

/** Ébullition portant trois échéances de houblonnage (M9-04). */
const BOIL_WITH_HOPS = {
  id: "boil-1",
  phase: "BOIL",
  label: "Ébullition",
  requiresStabilization: true,
  plannedHoldMin: 60,
  targetTempC: 100,
  hopAdditions: [
    {
      name: "Magnum",
      amountG: 30,
      nature: "BITTERING",
      remainingMin: 60,
      offsetFromStartMin: 0,
      inconsistent: false,
    },
    {
      name: "Cascade",
      amountG: 40,
      nature: "AROMA",
      remainingMin: 55,
      offsetFromStartMin: 5,
      inconsistent: false,
    },
    {
      name: "Citra",
      amountG: 50,
      nature: "FLAME_OUT",
      remainingMin: 0,
      offsetFromStartMin: 60,
      inconsistent: false,
    },
  ],
};

interface DayViewOptions {
  plan: readonly unknown[];
  phase: string;
  cursor: number;
  status: string;
  measurements?: readonly unknown[];
  stepStartedAt?: number | null;
  stabilizedAt?: number | null;
  timer?: unknown;
  revision?: number;
}

function dayView(opts: DayViewOptions) {
  const {
    plan,
    phase,
    cursor,
    status,
    measurements = [],
    stepStartedAt = null,
    stabilizedAt = null,
    timer = null,
    revision = 0,
  } = opts;
  return {
    batchStatus: "EN_BRASSAGE",
    phase,
    revision,
    plan,
    state: {
      plan,
      cursor,
      status,
      stepStartedAt,
      stabilizedAt,
      timer,
      measurements,
      completedStepIds: [],
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
    if (path.endsWith("/api/batches/b1/day/deviations") && method === "GET") {
      return Promise.resolve(json(200, { deviations: [] }));
    }
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

/** Événements réellement postés au serveur (hors GET). */
const postedEvents = () =>
  calls
    .filter((c) => c.method === "POST" && c.url.endsWith("/day/events"))
    .map((c) => c.body?.type);

beforeEach(() => {
  calls = [];
  useSession.setState({ user: USER });
  useDayToasts.setState({ toasts: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("validation manuelle d'une étape sans minuteur (M9-11 §A)", () => {
  it("propose « Valider l'étape » et n'écrit AUCUN écart de procédure", async () => {
    // Filtration mesures faites : rien ne bloque, mais rien ne s'écoule non plus.
    scenario = {
      day: dayView({
        plan: [LAUTER],
        phase: "FILTRATION",
        cursor: 0,
        status: "AWAITING_VALIDATION",
        stepStartedAt: 1,
        measurements: [
          { kind: "density", value: 1.048, at: 2, stepId: "lauter-1", source: "manual" },
          { kind: "volume", value: 30, at: 3, stepId: "lauter-1", source: "manual" },
        ],
      }),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const validate = await screen.findByRole("button", { name: /valider l'étape/i });
    expect(validate).toBeEnabled();
    await user.click(validate);

    // Le cœur du bug : une progression nominale n'est PAS un écart. Un seul
    // événement part, et c'est VALIDATE_STEP — jamais FORCE_STEP.
    expect(postedEvents()).toEqual(["VALIDATE_STEP"]);
  });

  it("dit explicitement que l'étape n'a pas de minuteur", async () => {
    scenario = {
      day: dayView({
        plan: [{ ...LAUTER, requiredMeasurements: [] }],
        phase: "FILTRATION",
        cursor: 0,
        status: "AWAITING_VALIDATION",
        stepStartedAt: 1,
      }),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
    renderApp();

    expect(await screen.findByText(/n'a pas de minuteur/i)).toBeInTheDocument();
  });

  it("« Forcer l'étape » reste distinct, motivé, et produit un écart", async () => {
    scenario = {
      day: dayView({
        plan: [LAUTER],
        phase: "FILTRATION",
        cursor: 0,
        status: "AWAITING_VALIDATION",
        stepStartedAt: 1,
      }),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    // Les deux actions coexistent et ne se confondent pas.
    const force = await screen.findByRole("button", { name: /forcer l'étape/i });
    expect(screen.getByRole("button", { name: /valider l'étape/i })).not.toBe(force);
    expect(screen.getByText(/consigne un écart de procédure/i)).toBeInTheDocument();

    await user.click(force);
    await user.type(await screen.findByLabelText(/motif/i), "vanne bloquée");
    await user.click(screen.getByRole("button", { name: /confirmer le forçage/i }));

    expect(postedEvents()).toEqual(["FORCE_STEP"]);
  });
});

describe("sortie de refroidissement (M9-11 §B)", () => {
  const coolingAt = (temperatureC: number) =>
    dayView({
      plan: [COOLING],
      phase: "REFROIDISSEMENT",
      cursor: 0,
      status: "AWAITING_VALIDATION",
      stepStartedAt: 1,
      stabilizedAt: 2,
      measurements: [
        { kind: "temperature", value: temperatureC, at: 3, stepId: "cooling-1", source: "manual" },
      ],
    });

  it("à la cible atteinte, la validation enchaîne", async () => {
    scenario = { day: coolingAt(19), onEvent: () => json(200, { day: scenario.day }) };
    installFetch();
    const user = userEvent.setup();
    renderApp();

    const validate = await screen.findByRole("button", { name: /valider l'étape/i });
    expect(validate).toBeEnabled();
    await user.click(validate);
    expect(postedEvents()).toEqual(["VALIDATE_STEP"]);
  });

  it("hors cible, affiche l'écart chiffré au lieu de bloquer sans explication", async () => {
    scenario = { day: coolingAt(28), onEvent: () => json(200, { day: scenario.day }) };
    installFetch();
    renderApp();

    // L'opérateur lit **de combien** il est loin, pas un simple refus.
    expect(await screen.findByText(/28 °C hors cible/i)).toBeInTheDocument();
    expect(screen.getByText(/attendu ≤ 20 °C/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /valider l'étape/i })).toBeDisabled();
  });

  it("hors cible, la mesure saisie est conservée et horodatée", async () => {
    scenario = { day: coolingAt(28), onEvent: () => json(200, { day: scenario.day }) };
    installFetch();
    renderApp();

    // Conserver les relevés est ce qui permet de suivre la descente jusqu'à
    // l'ensemencement, plutôt que de repartir d'un écran vide à chaque tentative.
    const measures = await screen.findByRole("region", { name: /mesures de l'étape/i });
    expect(within(measures).getByText("28 °C")).toBeInTheDocument();
    expect(within(measures).getByText(/^à \d{2}:\d{2}$/)).toBeInTheDocument();
    // …et la saisie reste ouverte pour consigner la suite de la descente
    // (le bouton ne s'active qu'une fois une valeur tapée, cf. M4-11).
    expect(within(measures).getByLabelText(/valeur relevée/i)).toBeEnabled();
  });
});

describe("whirlpool (M9-11 §C)", () => {
  it("s'affiche entre ébullition et refroidissement, avec sa durée", async () => {
    scenario = {
      day: dayView({
        plan: [BOIL_WITH_HOPS, WHIRLPOOL, COOLING],
        phase: "WHIRLPOOL",
        cursor: 1,
        status: "PENDING",
      }),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
    renderApp();

    expect(await screen.findByRole("heading", { name: "Whirlpool" })).toBeInTheDocument();
    expect(screen.getByText("Durée prévue : 15 min")).toBeInTheDocument();

    // Ordre du fil de progression : ébullition → whirlpool → refroidissement.
    const progress = screen.getByRole("list", { name: /progression des phases/i });
    const phases = within(progress)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(phases.join(" ")).toMatch(/Ébullition.*Whirlpool.*Refroidissement/);
  });

  it("une recette sans whirlpool n'affiche AUCUNE étape vide", async () => {
    scenario = {
      day: dayView({
        plan: [BOIL_WITH_HOPS, COOLING],
        phase: "REFROIDISSEMENT",
        cursor: 1,
        status: "PENDING",
      }),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
    renderApp();

    await screen.findByRole("heading", { name: "Refroidissement" });
    expect(screen.queryByText(/whirlpool/i)).not.toBeInTheDocument();
  });
});

describe("assainissement du circuit de refroidissement (M9-11 §D)", () => {
  beforeEach(() => {
    scenario = {
      day: dayView({
        plan: [SANITIZE, COOLING],
        phase: "EBULLITION",
        cursor: 0,
        status: "PENDING",
      }),
      onEvent: () => json(200, { day: scenario.day }),
    };
    installFetch();
  });

  it("affiche l'étape dérivée avec sa consigne et sa durée", async () => {
    renderApp();

    const guidance = await screen.findByTestId("sanitize-guidance");
    expect(guidance).toHaveTextContent(/moût encore bouillant/i);
    expect(guidance).toHaveTextContent(/circuit de refroidissement/i);
    expect(screen.getByText("Durée prévue : 5 min")).toBeInTheDocument();
  });

  it("ADR-11 : porte le disclaimer alimentaire et le vocabulaire d'aide à la décision", async () => {
    renderApp();

    const guidance = await screen.findByTestId("sanitize-guidance");
    expect(guidance).toHaveTextContent(/indicateur d'aide à la décision/i);
    expect(screen.getByTestId("sanitize-disclaimer")).toHaveTextContent(
      /ne remplace pas une validation d'hygiène alimentaire professionnelle/i,
    );
  });

  it("ADR-11 : l'écran ne prononce jamais « stérilisation », « conforme » ni « sûr »", async () => {
    renderApp();
    await screen.findByTestId("sanitize-guidance");

    // Le vocabulaire rassurant est proscrit : on n'atteste d'aucune innocuité.
    const texte = document.querySelector("main")?.textContent ?? "";
    expect(texte).not.toMatch(/stéril/i);
    expect(texte).not.toMatch(/conforme/i);
    expect(texte).not.toMatch(/\bsûre?\b/i);
    expect(texte).toMatch(/assainissement/i);
  });
});

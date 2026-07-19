import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CyclePanel } from "@/features/batches/CyclePanel";
import type { BatchMilestone, BatchVolumes } from "@/lib/api";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

function milestone(over: Partial<BatchMilestone> = {}): BatchMilestone {
  return {
    id: "ms1",
    kind: "FERMENTATION",
    plannedDurationDays: 14,
    plannedStartAt: "2026-03-01T00:00:00.000Z",
    plannedEndAt: "2026-03-15T00:00:00.000Z",
    plannedStartDate: "2026-03-01",
    plannedEndDate: "2026-03-15",
    actualStartAt: null,
    actualEndAt: null,
    actualStartDate: null,
    actualEndDate: null,
    completed: false,
    sortOrder: 0,
    ...over,
  };
}

const VOLUMES: BatchVolumes = {
  preBoil: { volumeL: 30, source: "measured" },
  postBoil: { volumeL: 27, source: "estimated" },
  transferred: { volumeL: 25.5, source: "estimated" },
  pitched: { volumeL: 25, source: "measured" },
  packaged: { volumeL: 24, source: "measured" },
  evaporationL: 3,
  packagingYieldPercent: 80,
  warnings: [],
};

/** Défauts de cycle (M9-16), lus par la frise pour le rattrapage de planification. */
const CYCLE_DEFAULTS = {
  timezone: "Europe/Paris",
  fermentationDays: 14,
  dryHopDays: 3,
  coldCrashDays: 2,
  gardeDays: 21,
  hasDryHop: false,
};

let milestones: BatchMilestone[];
let volumes: BatchVolumes;
let failVolumes = false;
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
    if (path.endsWith("/cycle-defaults")) {
      return Promise.resolve(json(200, { defaults: CYCLE_DEFAULTS }));
    }
    // Ajustement d'un jalon (M9-12 §E) : le serveur renvoie la séquence
    // recalculée en cascade — ici, inchangée, le test portant sur la requête.
    if (/\/milestones\/[A-Z_]+$/.exec(path) && method === "PATCH") {
      return Promise.resolve(json(200, { milestones }));
    }
    if (path.endsWith("/milestones")) return Promise.resolve(json(200, { milestones }));
    if (path.endsWith("/volumes")) {
      if (failVolumes)
        return Promise.resolve(json(500, { error: { code: "OOPS", message: "ko" } }));
      return Promise.resolve(json(200, { volumes }));
    }
    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CyclePanel batchId="b1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  milestones = [
    milestone({ id: "ms1", kind: "FERMENTATION", completed: true, actualEndDate: "2026-03-16" }),
    milestone({
      id: "ms2",
      kind: "COLD_CRASH",
      plannedDurationDays: 2,
      plannedStartDate: "2026-03-16",
      plannedEndDate: "2026-03-18",
      sortOrder: 1,
    }),
    milestone({
      id: "ms3",
      kind: "GARDE",
      plannedDurationDays: 21,
      plannedStartDate: "2026-03-18",
      plannedEndDate: "2026-04-08",
      sortOrder: 2,
    }),
  ];
  volumes = { ...VOLUMES };
  failVolumes = false;
  calls = [];
  useSession.setState({ user: USER });
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useSession.setState({ user: null });
});

describe("frise des jalons du cycle (M9-10 §B)", () => {
  it("affiche chaque jalon avec sa durée et ses dates prévues", async () => {
    renderPanel();

    expect(await screen.findByText("Fermentation")).toBeInTheDocument();
    expect(screen.getByText("Cold crash")).toBeInTheDocument();
    expect(screen.getByText("Garde")).toBeInTheDocument();
    expect(screen.getByText("21 j")).toBeInTheDocument();
  });

  it("distingue achevé, en cours et à venir par du TEXTE, pas seulement la couleur", async () => {
    renderPanel();

    // Contrainte d'accessibilité AA (§6) : la couleur seule ne suffit pas.
    expect(await screen.findByText("Terminé")).toBeInTheDocument();
    expect(screen.getByText("En cours")).toBeInTheDocument();
    expect(screen.getByText("À venir")).toBeInTheDocument();
  });

  it("le premier jalon non achevé est celui en cours", async () => {
    renderPanel();
    await screen.findByText("Fermentation");

    const coldCrash = screen.getByText("Cold crash").closest("li");
    expect(coldCrash).not.toBeNull();
    expect(within(coldCrash as HTMLElement).getByText("En cours")).toBeInTheDocument();
  });

  it("affiche la date réelle d'un jalon achevé à côté de la prévision", async () => {
    renderPanel();
    const fermentation = (await screen.findByText("Fermentation")).closest("li");
    expect(within(fermentation as HTMLElement).getByText(/terminé le/)).toBeInTheDocument();
  });

  it("sans jalon, explique quand le cycle démarre plutôt que de laisser vide", async () => {
    milestones = [];
    renderPanel();
    expect(await screen.findByText(/le cycle démarre à la validation/i)).toBeInTheDocument();
  });

  it("sans jalon, offre le rattrapage : un Jour J forcé ne doit pas laisser un cul-de-sac", async () => {
    milestones = [];
    renderPanel();
    expect(await screen.findByRole("button", { name: /planifier le cycle/i })).toBeInTheDocument();
  });
});

describe("ajustement des durées prévues depuis la fiche (M9-12 §E)", () => {
  it("un jalon achevé est présenté comme figé, sans action qui échouerait", async () => {
    renderPanel();
    const fermentation = (await screen.findByText("Fermentation")).closest("li") as HTMLElement;

    // Le serveur refuse (409) l'ajustement d'un jalon achevé : ne rien proposer
    // vaut mieux qu'un bouton qui mène à une erreur.
    expect(within(fermentation).getByText(/figé/i)).toBeInTheDocument();
    expect(
      within(fermentation).queryByRole("button", { name: /ajuster la durée/i }),
    ).not.toBeInTheDocument();
  });

  it("un jalon à venir reste ajustable", async () => {
    renderPanel();
    const garde = (await screen.findByText("Garde")).closest("li") as HTMLElement;
    expect(within(garde).getByRole("button", { name: /ajuster la durée/i })).toBeInTheDocument();
  });

  it("enregistrer une nouvelle durée envoie le PATCH du jalon", async () => {
    const user = userEvent.setup();
    renderPanel();
    const garde = (await screen.findByText("Garde")).closest("li") as HTMLElement;

    await user.click(within(garde).getByRole("button", { name: /ajuster la durée/i }));
    const input = within(garde).getByLabelText(/durée prévue/i);
    await user.clear(input);
    await user.type(input, "30");
    await user.click(within(garde).getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => {
      const patched = calls.find((c) => c.method === "PATCH");
      expect(patched?.url).toContain("/milestones/GARDE");
      expect(patched?.body).toEqual({ plannedDurationDays: 30 });
    });
  });

  it("une durée hors bornes est refusée avec un message, sans requête", async () => {
    const user = userEvent.setup();
    renderPanel();
    const garde = (await screen.findByText("Garde")).closest("li") as HTMLElement;

    await user.click(within(garde).getByRole("button", { name: /ajuster la durée/i }));
    const input = within(garde).getByLabelText(/durée prévue/i);
    await user.clear(input);
    await user.type(input, "400");

    expect(within(garde).getByRole("button", { name: /enregistrer/i })).toBeDisabled();
    expect(within(garde).getByRole("alert")).toHaveTextContent(/entre 0 et 365/);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("annonce qu'une durée à 0 supprime le jalon", async () => {
    const user = userEvent.setup();
    renderPanel();
    const garde = (await screen.findByText("Garde")).closest("li") as HTMLElement;

    await user.click(within(garde).getByRole("button", { name: /ajuster la durée/i }));
    const input = within(garde).getByLabelText(/durée prévue/i);
    await user.clear(input);
    await user.type(input, "0");

    expect(within(garde).getByText(/ce jalon sera supprimé/i)).toBeInTheDocument();
  });
});

describe("synthèse des volumes (M9-10 §B)", () => {
  it("affiche la chaîne complète et le rendement de conditionnement", async () => {
    renderPanel();

    expect(await screen.findByText("Pré-ébullition")).toBeInTheDocument();
    expect(screen.getByText("30 L")).toBeInTheDocument();
    expect(screen.getByText("Rendement de conditionnement")).toBeInTheDocument();
    expect(screen.getByText("80.0 %")).toBeInTheDocument();
  });

  it("distingue un volume mesuré d'un volume estimé", async () => {
    renderPanel();
    await screen.findByText("Pré-ébullition");

    // Un volume relevé et un volume déduit n'ont pas la même valeur de preuve.
    expect(screen.getAllByText("Mesuré").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Estimé").length).toBeGreaterThan(0);
  });

  it("un volume inconnu le dit, plutôt que d'afficher zéro", async () => {
    volumes = { ...VOLUMES, packaged: { volumeL: null, source: "unknown" } };
    renderPanel();
    expect(await screen.findByText("Non renseigné")).toBeInTheDocument();
  });

  it("un rendement incalculable n'affiche pas 0 %", async () => {
    volumes = { ...VOLUMES, packagingYieldPercent: null };
    renderPanel();
    expect(await screen.findByText("Non calculable")).toBeInTheDocument();
  });

  it("relaie l'avertissement d'un rendement supérieur à 100 %", async () => {
    volumes = {
      ...VOLUMES,
      packagingYieldPercent: 120,
      warnings: ["Rendement supérieur à 100 % : vérifier les volumes saisis."],
    };
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent(/supérieur à 100/);
  });

  it("une erreur de chargement est signalée sans casser la frise", async () => {
    failVolumes = true;
    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de charger les volumes.",
    );
    // La frise des jalons, elle, reste affichée.
    expect(screen.getByText("Fermentation")).toBeInTheDocument();
  });
});

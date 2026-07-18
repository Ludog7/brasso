import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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

let milestones: BatchMilestone[];
let volumes: BatchVolumes;
let failVolumes = false;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch() {
  const impl = vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const path = url.split("?")[0] ?? url;

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));
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
  useSession.setState({ user: USER, status: "authenticated" });
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useSession.setState({ user: null, status: "anonymous" });
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

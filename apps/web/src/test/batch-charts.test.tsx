import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { TimeSeriesChart } from "@/features/batches/charts/TimeSeriesChart";
import type { BatchDetail, BatchMeasure } from "@/lib/api";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

const ISO = new Date("2026-07-10T10:00:00Z").toISOString();

// --- 1. TimeSeriesChart (composant pur) -----------------------------------

describe("TimeSeriesChart (M3-10)", () => {
  const points = [
    { t: Date.parse("2026-07-10T08:00:00Z"), y: 1.05 },
    { t: Date.parse("2026-07-11T08:00:00Z"), y: 1.03 },
    { t: Date.parse("2026-07-12T08:00:00Z"), y: 1.012 },
  ];

  it("trace un point par relevé, un résumé accessible et un repli tableau", () => {
    const { container } = render(
      <TimeSeriesChart
        title="Densité"
        unit="SG"
        color="var(--chart-gravity)"
        points={points}
        formatValue={(y) => y.toFixed(3)}
        emptyHint="Aucune mesure."
      />,
    );

    // Résumé porté par le SVG (role img), avec le nombre de relevés.
    const img = screen.getByRole("img", { name: /Densité : 3 relevés/ });
    expect(img).toBeInTheDocument();
    // Un marqueur par point.
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    // Repli tabulaire listant chaque valeur (pas de dataviz-only).
    expect(screen.getByText("Afficher les valeurs (3)")).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("1.050")).toBeInTheDocument();
    expect(table.getByText("1.012")).toBeInTheDocument();
  });

  it("affiche une invite claire et aucun graphe quand la série est vide", () => {
    render(
      <TimeSeriesChart
        title="Densité"
        unit="SG"
        color="var(--chart-gravity)"
        points={[]}
        formatValue={(y) => y.toFixed(3)}
        emptyHint="Aucune mesure de densité pour l'instant."
      />,
    );

    expect(screen.getByText("Aucune mesure de densité pour l'instant.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

// --- 2. Intégration page détail : dérivation + mise à jour -----------------

function makeBatch(): BatchDetail {
  return {
    id: "b1",
    batchNumber: 7,
    recipeId: "r1",
    recipeVersion: 2,
    equipmentProfileId: null,
    status: "EN_FERMENTATION",
    plannedAt: ISO,
    brewedAt: ISO,
    fermentedAt: ISO,
    packagedAt: null,
    completedAt: null,
    createdAt: ISO,
    updatedAt: ISO,
    recipeSnapshot: { name: "IPA maison", steps: [], ingredients: [] },
    reservations: [],
  };
}

function measure(
  id: string,
  type: BatchMeasure["type"],
  value: number,
  hours: number,
): BatchMeasure {
  return {
    id,
    type,
    value,
    unit: type === "GRAVITY" ? "SG" : "°C",
    phase: null,
    loggedById: USER.id,
    loggedAt: new Date(Date.parse("2026-07-10T08:00:00Z") + hours * 3_600_000).toISOString(),
  };
}

let batch: BatchDetail;
let measures: BatchMeasure[] = [];

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
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));

    if (/\/api\/batches\/[^/]+\/measures$/.exec(path)) {
      if (method === "GET") return Promise.resolve(json(200, { measures }));
      if (method === "POST") {
        const created: BatchMeasure = {
          id: `m${measures.length + 1}`,
          type: body.type,
          value: body.value,
          unit: body.unit ?? null,
          phase: body.phase ?? null,
          loggedById: USER.id,
          loggedAt: new Date("2026-07-13T08:00:00Z").toISOString(),
        };
        measures = [...measures, created];
        return Promise.resolve(json(201, { measure: created }));
      }
    }

    if (/\/api\/batches\/[^/]+$/.exec(path) && method === "GET") {
      return Promise.resolve(json(200, { batch }));
    }

    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp(initialEntries: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  batch = makeBatch();
  measures = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("graphes de suivi du batch (M3-10)", () => {
  it("invite à saisir des mesures quand il n'y en a aucune", async () => {
    installFetch();
    renderApp(["/batches/b1"]);

    await screen.findByText(/Batch nº 7/);
    expect(await screen.findByText(/Ajoute une mesure de densité/)).toBeInTheDocument();
  });

  it("dérive les courbes densité et température des mesures existantes", async () => {
    measures = [
      measure("m1", "GRAVITY", 1.05, 0),
      measure("m2", "TEMPERATURE", 20, 1),
      measure("m3", "GRAVITY", 1.03, 24),
      measure("m4", "TEMPERATURE", 18, 25),
    ];
    installFetch();
    renderApp(["/batches/b1"]);

    await screen.findByText(/Batch nº 7/);
    expect(await screen.findByRole("img", { name: /Densité : 2 relevés/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Température : 2 relevés/ })).toBeInTheDocument();
  });

  it("retrace la courbe de densité après l'ajout d'une mesure", async () => {
    measures = [measure("m1", "GRAVITY", 1.05, 0), measure("m2", "GRAVITY", 1.03, 24)];
    installFetch();
    const user = userEvent.setup();
    renderApp(["/batches/b1"]);

    await screen.findByText(/Batch nº 7/);
    await screen.findByRole("img", { name: /Densité : 2 relevés/ });

    // Le formulaire du journal défaut sur GRAVITY.
    await user.type(screen.getByLabelText("Valeur"), "1.012");
    await user.click(screen.getByRole("button", { name: /ajouter/i }));

    const chart = await screen.findByRole("img", { name: /Densité : 3 relevés/ });
    expect(chart).toBeInTheDocument();
    // La nouvelle valeur apparaît dans le repli tabulaire du graphe densité.
    const figure = screen.getByRole("figure", { name: /Densité/ });
    const table = within(figure).getByRole("table");
    expect(within(table).getByText("1.012")).toBeInTheDocument();
  });
});

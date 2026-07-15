import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CostPanel } from "@/features/batches/CostPanel";
import { StockDeductionPanel } from "@/features/batches/StockDeductionPanel";
import type { BatchCost, BatchReservation } from "@/lib/api";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeCost(overrides: Partial<BatchCost> = {}): BatchCost {
  return {
    ingredientsCents: 4500,
    conditioningCents: 1500,
    bulkCents: 0,
    totalCents: 6000,
    costPerLiterCents: 300,
    costPerPackagedUnitCents: null,
    missingCostLines: 0,
    basis: "planned",
    ...overrides,
  };
}

function stubCost(cost: BatchCost) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(json(200, { cost }))),
  );
}

function renderPanel(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CostPanel — coût de revient (M5-08)", () => {
  it("affiche total, coût au litre et répartition depuis un BatchCost stubé", async () => {
    stubCost(makeCost());
    renderPanel(<CostPanel batchId="b1" />);

    // Total (60,00 €), coût au litre (3,00 €/L), répartition ingrédients/conditionnement.
    expect(await screen.findByText(/60,00/)).toBeInTheDocument();
    expect(screen.getByText(/3,00.*\/L/)).toBeInTheDocument();
    expect(screen.getByText("Ingrédients")).toBeInTheDocument();
    expect(screen.getByText(/45,00/)).toBeInTheDocument();
    expect(screen.getByText("Conditionnement")).toBeInTheDocument();
    expect(screen.getByText(/15,00/)).toBeInTheDocument();
  });

  it("libelle la base « Estimation planifiée » avant ensemencement", async () => {
    stubCost(makeCost({ basis: "planned" }));
    renderPanel(<CostPanel batchId="b1" />);

    expect(await screen.findByText("Estimation planifiée")).toBeInTheDocument();
    expect(screen.queryByText("Depuis consommation réelle")).not.toBeInTheDocument();
  });

  it("bascule la base sur « Depuis consommation réelle » après ensemencement", async () => {
    stubCost(makeCost({ basis: "consumed" }));
    renderPanel(<CostPanel batchId="b1" />);

    expect(await screen.findByText("Depuis consommation réelle")).toBeInTheDocument();
    expect(screen.queryByText("Estimation planifiée")).not.toBeInTheDocument();
  });

  it("signale les lignes sans coût de référence (total sous-estimé)", async () => {
    stubCost(makeCost({ missingCostLines: 2 }));
    const { container } = renderPanel(<CostPanel batchId="b1" />);

    expect(await screen.findByText(/2 ingrédients sans coût de référence/)).toBeInTheDocument();
    expect(container.textContent).toMatch(/sous-estimé/);
  });

  it("affiche le disclaimer d'estimation, jamais « exact » / « garanti »", async () => {
    stubCost(makeCost());
    const { container } = renderPanel(<CostPanel batchId="b1" />);

    expect(
      await screen.findByText(/Estimation basée sur les coûts de référence/),
    ).toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toMatch(/\bexact\b|garanti/);
  });
});

describe("StockDeductionPanel — réservé vs consommé (M5-08)", () => {
  const names = new Map([["cat-malt", "Pale Ale"]]);

  function reservation(overrides: Partial<BatchReservation> = {}): BatchReservation {
    return {
      id: "res1",
      catalogItemId: "cat-malt",
      quantity: 5000,
      status: "RESERVED",
      ...overrides,
    };
  }

  it("montre le stock réservé mais pas encore déduit avant ensemencement", () => {
    render(<StockDeductionPanel reservations={[reservation()]} names={names} />);

    expect(screen.getByText(/pas encore déduit/)).toBeInTheDocument();
    expect(screen.getByText("Pale Ale")).toBeInTheDocument();
    expect(screen.getByText("Réservé")).toBeInTheDocument();
    expect(screen.queryByText("Déduit")).not.toBeInTheDocument();
  });

  it("montre le stock déduit au volume réel après consommation", () => {
    render(
      <StockDeductionPanel reservations={[reservation({ status: "CONSUMED" })]} names={names} />,
    );

    expect(screen.getByText(/déduit à l'ensemencement/i)).toBeInTheDocument();
    expect(screen.getByText(/volume réel/)).toBeInTheDocument();
    expect(screen.getByText("Déduit")).toBeInTheDocument();
  });

  it("ignore les réservations libérées et gère le cas vide", () => {
    render(
      <StockDeductionPanel reservations={[reservation({ status: "RELEASED" })]} names={names} />,
    );

    expect(screen.getByText("Aucune réservation de stock.")).toBeInTheDocument();
  });
});

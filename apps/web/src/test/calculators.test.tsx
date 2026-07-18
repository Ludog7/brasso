import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { BiabCalculator } from "@/features/calculators/BiabCalculator";
import { DilutionCalculator } from "@/features/calculators/DilutionCalculator";
import { StarterCalculator } from "@/features/calculators/StarterCalculator";
import { WaterCalculator } from "@/features/calculators/WaterCalculator";
import { CalculatorsPage } from "@/routes/calculators/CalculatorsPage";

// Page « Calculateurs » (M8-02) : les 4 outils calculent 100 % côté client via
// @brasso/core (M8-01). On valide une saisie de référence (alignée FORMULES), le
// recalcul à la modification et le traitement d'une saisie invalide (sans crash).

function region(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("StarterCalculator (§12.1)", () => {
  it("saisie de référence (ale, 20 L, OG 1.048) → ~179 requises, déficit ~79, starter ~0.4 L", () => {
    render(<StarterCalculator />);
    const section = region("Starter / levure");
    expect(section).toHaveTextContent(/Cellules requises\s*179/);
    expect(section).toHaveTextContent(/Cellules disponibles\s*100/);
    expect(section).toHaveTextContent(/Déficit\s*79/);
    expect(section).toHaveTextContent(/Pied de cuve conseillé\s*0[.,]4/);
    // Mention ADR-11 (aide à la décision).
    expect(section).toHaveTextContent(/aide à la décision/i);
  });

  it("recalcule quand le volume change (20 → 40 L double le besoin)", async () => {
    const user = userEvent.setup();
    render(<StarterCalculator />);
    const volume = screen.getByLabelText(/Volume de moût/);
    await user.clear(volume);
    await user.type(volume, "40");
    expect(region("Starter / levure")).toHaveTextContent(/Cellules requises\s*357/);
  });

  it("saisie invalide (OG vidée) → message sans planter", async () => {
    const user = userEvent.setup();
    render(<StarterCalculator />);
    await user.clear(screen.getByLabelText(/Densité initiale/));
    const section = region("Starter / levure");
    expect(within(section).getByRole("alert")).toHaveTextContent(/À vérifier/);
    expect(section).not.toHaveTextContent(/Cellules requises\s*179/);
  });
});

describe("WaterCalculator (§6)", () => {
  it("5 kg, ratio 3, 30 L → empâtage 15, rinçage 20, total 35, strike ≈ 73.4", () => {
    render(<WaterCalculator />);
    const section = region("Eau — empâtage & rinçage");
    expect(section).toHaveTextContent(/Eau d'empâtage\s*15[.,]0/);
    expect(section).toHaveTextContent(/Eau de rinçage\s*20[.,]0/);
    expect(section).toHaveTextContent(/Eau totale\s*35[.,]0/);
    expect(section).toHaveTextContent(/Température de chauffe\s*73[.,]4/);
  });
});

describe("BiabCalculator (§12.2)", () => {
  it("5 kg, 30 L, absorption 1.0 → total 35, absorption 5, ratio 7, strike ≈ 69.8", () => {
    render(<BiabCalculator />);
    const section = region("BIAB — une seule cuve");
    expect(section).toHaveTextContent(/Eau totale\s*35[.,]0/);
    expect(section).toHaveTextContent(/Eau absorbée\s*5[.,]0/);
    expect(section).toHaveTextContent(/Ratio d'empâtage\s*7[.,]0/);
    expect(section).toHaveTextContent(/Température de chauffe\s*69[.,]8/);
  });
});

describe("DilutionCalculator (§9.3)", () => {
  it("1.060 sur 20 L → cible 1.050 : +4 L (volume final 24 L)", () => {
    render(<DilutionCalculator />);
    const section = region("Dilution vers une densité cible");
    expect(section).toHaveTextContent(/Eau à ajouter\s*4[.,]0/);
    expect(section).toHaveTextContent(/Volume final\s*24[.,]0/);
  });

  it("cible ≥ densité actuelle → message clair, pas de crash (RangeError capté)", async () => {
    const user = userEvent.setup();
    render(<DilutionCalculator />);
    const target = screen.getByLabelText(/Densité cible/);
    await user.clear(target);
    await user.type(target, "1.070");
    const section = region("Dilution vers une densité cible");
    expect(within(section).getByRole("alert")).toHaveTextContent(
      /inférieure à la densité actuelle/,
    );
    expect(section).not.toHaveTextContent(/Eau à ajouter/);
  });
});

describe("CalculatorsPage", () => {
  it("compose les 4 calculateurs sur une seule page", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <CalculatorsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Calculateurs" })).toBeInTheDocument();
    expect(region("Starter / levure")).toBeInTheDocument();
    expect(region("Eau — empâtage & rinçage")).toBeInTheDocument();
    expect(region("Dilution vers une densité cible")).toBeInTheDocument();
    expect(region("BIAB — une seule cuve")).toBeInTheDocument();
  });
});

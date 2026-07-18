import type { DayState, HopAdditionAlert, StepSpec } from "@brasso/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { playChime } from "@/features/day/chime";
import { buildHopSchedule, HOP_ALERT_LEAD_MS, hopScheduleAnchor } from "@/features/day/hops";
import { HopSchedule } from "@/features/day/HopSchedule";

vi.mock("@/features/day/chime", () => ({ playChime: vi.fn(() => true) }));

const MIN = 60_000;
/** Instant d'ancrage arbitraire mais fixe — les échéances s'y rapportent. */
const START = new Date("2026-07-18T10:00:00Z").getTime();

function hop(over: Partial<HopAdditionAlert> = {}): HopAdditionAlert {
  return {
    name: "Cascade",
    amountG: 40,
    nature: "AROMA",
    remainingMin: 10,
    offsetFromStartMin: 50,
    inconsistent: false,
    ...over,
  };
}

const BOIL: StepSpec = {
  id: "boil-1",
  phase: "BOIL",
  label: "Ébullition",
  requiresStabilization: true,
  plannedHoldMin: 60,
  targetTempC: 100,
  hopAdditions: [
    hop({
      name: "Magnum",
      amountG: 30,
      nature: "BITTERING",
      remainingMin: 60,
      offsetFromStartMin: 0,
    }),
    hop({
      name: "Cascade",
      amountG: 40,
      nature: "AROMA",
      remainingMin: 10,
      offsetFromStartMin: 50,
    }),
    hop({
      name: "Citra",
      amountG: 50,
      nature: "FLAME_OUT",
      remainingMin: 0,
      offsetFromStartMin: 60,
    }),
  ],
};

/** État Jour J sur l'étape d'ébullition, timer armé à {@link START}. */
function boilState(over: Partial<DayState> = {}): DayState {
  return {
    plan: [BOIL],
    cursor: 0,
    status: "TIMER_RUNNING",
    stepStartedAt: START - 10 * MIN,
    stabilizedAt: START,
    timer: { stepId: "boil-1", startedAt: START, plannedHoldMin: 60 },
    measurements: [],
    completedStepIds: [],
    ...over,
  };
}

/**
 * État dont l'ancrage est calé sur l'horloge **réelle**, `elapsedMin` minutes
 * après le début de l'étape. Les tests de rendu s'en servent plutôt que de geler
 * le temps : `useNow` bat à la seconde et `userEvent` pilote ses propres timers —
 * les deux cohabitent mal avec des faux timers, pour un gain nul ici.
 */
function elapsed(
  elapsedMin: number,
  hopAdditions = BOIL.hopAdditions,
): { state: DayState; step: StepSpec } {
  const startedAt = Date.now() - elapsedMin * MIN;
  const step: StepSpec = { ...BOIL, hopAdditions };
  const state: DayState = {
    ...boilState({
      stepStartedAt: startedAt - 10 * MIN,
      stabilizedAt: startedAt,
      timer: { stepId: "boil-1", startedAt, plannedHoldMin: 60 },
    }),
    plan: [step],
  };
  return { state, step };
}

/** Le seul hors-flamme du plan (échéance à +60 min). */
const FLAME_OUT = [BOIL.hopAdditions?.[2] ?? hop()];

function renderSchedule(state: DayState = boilState(), step: StepSpec = BOIL) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HopSchedule step={step} state={state} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(playChime).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ancrage des échéances de houblonnage (M9-11 §E/§F)", () => {
  it("part du timer armé : l'ébullition compte depuis l'ébullition réelle, pas depuis la chauffe", () => {
    // Ancrer sur `stepStartedAt` avancerait toutes les échéances de la durée de
    // montée en température — un hors-flamme 10 minutes trop tôt.
    expect(hopScheduleAnchor(boilState(), BOIL)).toBe(START);
  });

  it("sans timer, une étape à stabilisation part de la stabilisation confirmée", () => {
    const state = boilState({ timer: null, status: "AWAITING_VALIDATION" });
    expect(hopScheduleAnchor(state, BOIL)).toBe(START);
  });

  it("une étape sans stabilisation part de son démarrage", () => {
    const whirlpool: StepSpec = {
      id: "whirlpool-1",
      phase: "WHIRLPOOL",
      requiresStabilization: false,
    };
    const state = boilState({ timer: null, stepStartedAt: 42, stabilizedAt: null });
    expect(hopScheduleAnchor(state, whirlpool)).toBe(42);
  });

  it("étape non démarrée : aucun ancrage, donc aucune échéance datée", () => {
    const state = boilState({ timer: null, stepStartedAt: null, stabilizedAt: null });
    expect(hopScheduleAnchor(state, BOIL)).toBeNull();

    const schedule = buildHopSchedule(BOIL, state, START, new Set());
    // Les ajouts restent listés (anticipation de la pesée) mais rien n'est « dû ».
    expect(schedule).toHaveLength(3);
    expect(schedule.every((item) => item.status === "upcoming")).toBe(true);
    expect(schedule.every((item) => item.dueAt === null)).toBe(true);
  });

  it("situe chaque ajout : dépassé, imminent, à venir", () => {
    // 50 min après l'armement : Magnum est passé, Cascade est dû, Citra est à venir.
    const schedule = buildHopSchedule(BOIL, boilState(), START + 50 * MIN, new Set());
    expect(schedule.map((item) => item.status)).toEqual(["due", "due", "upcoming"]);

    // Deux minutes avant le hors-flamme : préavis.
    const later = buildHopSchedule(
      BOIL,
      boilState(),
      START + 60 * MIN - HOP_ALERT_LEAD_MS,
      new Set(),
    );
    expect(later[2]?.status).toBe("soon");
  });

  it("un ajout acquitté ne redevient jamais dû", () => {
    const schedule = buildHopSchedule(BOIL, boilState(), START + 60 * MIN, new Set(["boil-1#2"]));
    expect(schedule[2]?.status).toBe("done");
  });
});

describe("alertes de houblonnage à l'écran (M9-11 §E)", () => {
  it("liste les ajouts à venir avec leur échéance, pour anticiper la pesée", () => {
    renderSchedule(boilState({ timer: null, stepStartedAt: null, stabilizedAt: null }));

    const section = screen.getByRole("region", { name: /ajouts de houblon/i });
    expect(within(section).getByText(/Magnum · 30 g/)).toBeInTheDocument();
    expect(within(section).getByText(/Cascade · 40 g/)).toBeInTheDocument();
    expect(within(section).getByText(/Citra · 50 g/)).toBeInTheDocument();
    // Sans ancrage, l'échéance s'annonce en position dans l'étape.
    expect(within(section).getByText(/à \+50 min du démarrage/)).toBeInTheDocument();
  });

  it("alerte à l'échéance, et distingue le hors-flamme du dernier aromatique", async () => {
    const { state, step } = elapsed(60);
    renderSchedule(state, step);

    const alerts = await screen.findAllByRole("alert");
    const texte = alerts.map((a) => a.textContent).join(" ");
    // Le hors-flamme s'accompagne d'un geste sur le feu : le confondre avec un
    // aromatique change la bière.
    expect(texte).toMatch(/Hors-flamme — maintenant/);
    expect(texte).toMatch(/Coupe le feu, puis ajoute le houblon hors-flamme/);
    expect(texte).toMatch(/Aromatique — maintenant/);
    expect(texte).toMatch(/Citra · 50 g/);
  });

  it("prévient à l'approche, avant l'échéance", async () => {
    // 59 min écoulées : le hors-flamme tombe dans une minute.
    const { state, step } = elapsed(59, FLAME_OUT);
    renderSchedule(state, step);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/Prépare la pesée : Citra · 50 g/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("l'alerte est sonore ET visuelle : mains occupées, tablette à distance", async () => {
    const { state, step } = elapsed(60);
    renderSchedule(state, step);

    await screen.findAllByRole("alert");
    await waitFor(() => expect(vi.mocked(playChime)).toHaveBeenCalledWith("due"));
  });

  it("s'acquitte d'un geste, et l'alerte ne revient pas", async () => {
    const user = userEvent.setup();
    const { state, step } = elapsed(60, FLAME_OUT);
    renderSchedule(state, step);

    const alert = await screen.findByRole("alert");
    await user.click(within(alert).getByRole("button", { name: /ajout fait/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Fait")).toBeInTheDocument();
  });

  it("une étape sans houblonnage n'affiche rien", () => {
    const plain: StepSpec = { id: "mash-1", phase: "MASH", requiresStabilization: true };
    renderSchedule(boilState(), plain);
    expect(screen.queryByRole("region", { name: /ajouts de houblon/i })).not.toBeInTheDocument();
  });

  it("signale une échéance incohérente plutôt que de la masquer", () => {
    const step: StepSpec = {
      ...BOIL,
      hopAdditions: [
        hop({ name: "Herkules", remainingMin: 90, offsetFromStartMin: 0, inconsistent: true }),
      ],
    };
    renderSchedule(boilState(), step);
    expect(screen.getByRole("note")).toHaveTextContent(/au-delà de la durée d'ébullition/i);
  });
});

describe("les alertes ne dépendent pas du réseau (M9-11 §F)", () => {
  it("se déclenchent hors ligne : offsets ancrés localement, aucune requête", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("réseau coupé")));
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    const { state, step } = elapsed(60);
    renderSchedule(state, step);

    // C'est précisément le cas d'usage : wifi d'atelier instable, brassage en cours.
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { deadlineUrgency } from "@/features/batches/labels";
import type { BatchOverview, BatchOverviewPage } from "@/lib/api";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

/** Date calendaire `YYYY-MM-DD` décalée de `days` par rapport à aujourd'hui. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function overview(over: Partial<BatchOverview> = {}): BatchOverview {
  return {
    id: "b1",
    batchNumber: 12,
    recipeName: "IPA maison",
    engine: "BEER",
    status: "EN_FERMENTATION",
    plannedAt: "2026-04-01T08:00:00.000Z",
    brewedAt: "2026-04-01T08:00:00.000Z",
    completedAt: null,
    currentStep: { source: "MILESTONE", code: "FERMENTATION" },
    nextDeadline: {
      code: "FERMENTATION",
      at: `${dayOffset(10)}T00:00:00.000Z`,
      date: dayOffset(10),
    },
    plannedEndAt: `${dayOffset(30)}T00:00:00.000Z`,
    plannedEndDate: dayOffset(30),
    ...over,
  };
}

let page: BatchOverviewPage;
let failList = false;
let lastUrl = "";
let listCalls = 0;

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

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));

    if (path.endsWith("/api/batches/overview") && method === "GET") {
      listCalls += 1;
      lastUrl = url;
      if (failList) return Promise.resolve(json(500, { error: { code: "OOPS", message: "ko" } }));
      return Promise.resolve(json(200, page));
    }

    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp(initialEntries: string[] = ["/batches"]) {
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
  page = { items: [overview()], total: 1, limit: 25, offset: 0 };
  failList = false;
  lastUrl = "";
  listCalls = 0;
  useSession.setState({ user: USER });
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useSession.setState({ user: null });
});

describe("vue « Brassins » (M9-10)", () => {
  it("liste les brassins avec statut, étape courante et prochaine échéance", async () => {
    renderApp();

    expect(await screen.findByRole("heading", { name: "Brassins" })).toBeInTheDocument();
    // Attendre le contenu réel : le squelette de chargement occupe la liste
    // jusque-là, et c'est précisément ce qu'on veut (§4, jamais d'écran blanc).
    const item = (await screen.findByRole("link", { name: /IPA maison/ })).closest("li");
    expect(item).not.toBeNull();
    if (item === null) throw new Error("ligne de brassin introuvable");
    expect(within(item).getByText(/N°12/)).toBeInTheDocument();
    expect(within(item).getByText(/IPA maison/)).toBeInTheDocument();
    expect(within(item).getByText("En fermentation")).toBeInTheDocument();
    // L'étape courante et le jalon de l'échéance portent le même libellé.
    expect(within(item).getAllByText("Fermentation").length).toBeGreaterThan(0);
  });

  it("un seul appel alimente l'écran (l'agrégation vient de l'API)", async () => {
    page = {
      items: [overview({ id: "b1" }), overview({ id: "b2", batchNumber: 13 })],
      total: 2,
      limit: 25,
      offset: 0,
    };
    renderApp();
    await screen.findByText(/N°13/);

    // Deux brassins affichés, une seule requête : pas de N+1 côté front.
    expect(listCalls).toBe(1);
  });

  describe("mise en évidence des échéances", () => {
    it("signale une échéance dépassée", async () => {
      page.items = [
        overview({
          nextDeadline: {
            code: "GARDE",
            at: `${dayOffset(-2)}T00:00:00.000Z`,
            date: dayOffset(-2),
          },
        }),
      ];
      renderApp();
      expect(await screen.findByText("En retard")).toBeInTheDocument();
    });

    it("signale une échéance imminente", async () => {
      page.items = [
        overview({
          nextDeadline: { code: "GARDE", at: `${dayOffset(1)}T00:00:00.000Z`, date: dayOffset(1) },
        }),
      ];
      renderApp();
      expect(await screen.findByText("Imminent")).toBeInTheDocument();
    });

    it("une échéance lointaine reste discrète", async () => {
      renderApp();
      expect(await screen.findByText("À venir")).toBeInTheDocument();
    });

    it("un brassin sans échéance le dit explicitement", async () => {
      page.items = [overview({ nextDeadline: null, plannedEndDate: null })];
      renderApp();
      expect(await screen.findByText("Aucune échéance")).toBeInTheDocument();
    });
  });

  describe("filtres", () => {
    it("part de « en cours » : c'est ce qui réclame une action", async () => {
      renderApp();
      await screen.findByText(/N°12/);
      expect(lastUrl).toContain("scope=ongoing");
    });

    it("bascule vers les brassins terminés", async () => {
      const user = userEvent.setup();
      renderApp();
      await screen.findByText(/N°12/);

      await user.selectOptions(screen.getByLabelText("Affichage"), "finished");
      await vi.waitFor(() => expect(lastUrl).toContain("scope=finished"));
    });

    it("filtre par statut", async () => {
      const user = userEvent.setup();
      renderApp();
      await screen.findByText(/N°12/);

      await user.selectOptions(screen.getByLabelText("Statut"), "EN_BRASSAGE");
      await vi.waitFor(() => expect(lastUrl).toContain("status=EN_BRASSAGE"));
    });
  });

  describe("les trois états de l'écran (§4 : jamais d'écran blanc)", () => {
    it("chargement : un squelette, pas un spinner nu", async () => {
      renderApp();
      // Le squelette porte la forme de la liste pendant l'attente.
      expect(await screen.findByLabelText("Chargement des brassins")).toBeInTheDocument();
      await screen.findByText(/N°12/);
    });

    it("vide : propose de planifier un brassin depuis une recette", async () => {
      page = { items: [], total: 0, limit: 25, offset: 0 };
      renderApp();
      expect(await screen.findByText("Aucun brassin en cours.")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Planifier un brassin depuis une recette/ }),
      ).toBeInTheDocument();
    });

    it("erreur : message actionnable et bouton de réessai qui relance l'appel", async () => {
      const user = userEvent.setup();
      failList = true;
      renderApp();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Impossible de charger les brassins.",
      );
      failList = false;
      await user.click(screen.getByRole("button", { name: "Réessayer" }));
      expect(await screen.findByText(/N°12/)).toBeInTheDocument();
    });
  });

  it("navigue vers le détail d'un brassin", async () => {
    renderApp();
    const link = await screen.findByRole("link", { name: /IPA maison/ });
    expect(link).toHaveAttribute("href", "/batches/b1");
  });

  it("est accessible depuis l'accueil", async () => {
    renderApp(["/"]);
    const link = await screen.findByRole("link", { name: "Brassins" });
    expect(link).toHaveAttribute("href", "/batches");
  });
});

describe("deadlineUrgency — situe une échéance (M9-10)", () => {
  const today = new Date("2026-04-10T12:00:00Z");

  it("hier est en retard, aujourd'hui est imminent", () => {
    expect(deadlineUrgency("2026-04-09", today)).toBe("overdue");
    expect(deadlineUrgency("2026-04-10", today)).toBe("soon");
  });

  it("jusqu'à trois jours, l'échéance est imminente ; au-delà, elle est à venir", () => {
    expect(deadlineUrgency("2026-04-13", today)).toBe("soon");
    expect(deadlineUrgency("2026-04-14", today)).toBe("later");
  });

  it("compare en jours calendaires, pas en heures", () => {
    // Tard le soir, « demain » reste demain — une comparaison en millisecondes
    // basculerait selon l'heure de consultation.
    const lateEvening = new Date("2026-04-10T23:45:00");
    expect(deadlineUrgency("2026-04-11", lateEvening)).toBe("soon");
    expect(deadlineUrgency("2026-04-09", lateEvening)).toBe("overdue");
  });

  it("une date illisible ne fait pas planter l'affichage", () => {
    expect(deadlineUrgency("bogus", today)).toBe("later");
  });
});

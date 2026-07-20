/**
 * **Relevé de pression de carbonatation forcée** (#273) — l'écran qui rendait
 * M9-15 atteignable : sans lui, une ligne en carbonatation forcée restait
 * indéfiniment sans date de mise en vente.
 *
 * Monté via `App` sur `/batches/:id/packaging` avec un brassin **`TERMINE`** :
 * c'est l'état réel au moment d'un relevé, puisque c'est l'enregistrement du
 * conditionnement lui-même qui y mène (M9-08). Monter le seul panneau
 * masquerait précisément le risque que l'écran devienne inatteignable.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { PackagingLine } from "@/lib/api";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

const ISO = new Date("2026-04-10T09:00:00Z").toISOString();

const BATCH = {
  id: "b1",
  batchNumber: 7,
  recipeId: "r1",
  recipeVersion: 2,
  equipmentProfileId: null,
  status: "TERMINE",
  plannedAt: ISO,
  brewedAt: ISO,
  fermentedAt: ISO,
  packagedAt: ISO,
  completedAt: ISO,
  createdAt: ISO,
  updatedAt: ISO,
  recipeSnapshot: { name: "IPA maison", steps: [], ingredients: [] },
  reservations: [],
};

/** Motifs rendus par `saleAvailability` (core) et affichés **tels quels**. */
const PENDING_KEG =
  "Carbonatation forcée : en attente d'un relevé de pression atteignant la cible.";
const PENDING_NONE = "Aucune mise en condition déclarée pour ce contenant.";

/**
 * Ligne de conditionnement simulée, **typée par le contrat d'API** : une réponse
 * de test qui dériverait du type réel ferait passer un écran cassé en
 * production.
 */
function line(over: Partial<PackagingLine> = {}): PackagingLine {
  return {
    id: "pl-keg",
    catalogItemId: "prod-1",
    containerItemId: "c-keg",
    containerVolumeL: 20,
    quantity: 2,
    conditioningMethod: "FORCED_CARBONATION",
    co2TargetVolumes: 2.4,
    measuredPressureBar: null,
    measuredTempC: null,
    carbonationValidatedAt: null,
    availableForSaleAt: null,
    availableForSaleDate: null,
    pendingReason: PENDING_KEG,
    packagedAt: ISO,
    note: null,
    ...over,
  };
}

/** Cible retournée par l'aide au réglage : 1,34 bar ± 0,20. */
const TARGET = { targetBar: 1.34, toleranceBar: 0.2 };

let lines: PackagingLine[];
let calls: { method: string; url: string; body?: Record<string, unknown> }[];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Serveur simulé fidèle à M9-15 : la cible est **recalculée à la température
 * relevée**, et un relevé qui ne l'atteint pas est conservé sans poser de date.
 */
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

      if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));
      if (path.endsWith("/api/stock/items")) return Promise.resolve(json(200, { items: [] }));

      if (path.endsWith("/packaging/pressure")) {
        return Promise.resolve(json(200, { target: TARGET }));
      }

      if (path.endsWith("/carbonation") && method === "POST") {
        const lineId = path.split("/").at(-2) as string;
        const target = lines.find((l) => l.id === lineId);
        const pressureBar = Number(body?.pressureBar);
        const deltaBar = Math.round((pressureBar - TARGET.targetBar) * 100) / 100;
        const onTarget = Math.abs(deltaBar) <= TARGET.toleranceBar;

        // Le relevé est conservé dans les deux cas ; seule la date dépend du
        // verdict — c'est tout l'objet du ticket.
        const availableForSaleDate = onTarget ? "2026-04-24" : null;
        if (target) {
          target.measuredPressureBar = pressureBar;
          target.measuredTempC = Number(body?.tempC);
          target.availableForSaleDate = availableForSaleDate;
          target.pendingReason = onTarget ? null : PENDING_KEG;
        }

        return Promise.resolve(
          json(201, {
            reading: {
              targetBar: TARGET.targetBar,
              deltaBar,
              onTarget,
              line: target,
              availableForSaleDate,
              pendingReason: onTarget ? null : PENDING_KEG,
            },
          }),
        );
      }

      if (path.endsWith("/packaging") && method === "GET") {
        return Promise.resolve(json(200, { packaging: lines }));
      }
      if (/\/api\/batches\/[^/]+$/.exec(path) && method === "GET") {
        return Promise.resolve(json(200, { batch: BATCH }));
      }
      return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
    }),
  );
}

function renderPackaging() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/batches/b1/packaging"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Attend le panneau de mise en condition monté avec ses lignes. */
const panelReady = () => screen.findByText(/^Mise en condition$/);

/** Renseigne température puis pression relevée du premier fût affiché. */
async function fillReading(
  user: ReturnType<typeof userEvent.setup>,
  tempC: string,
  pressureBar: string,
) {
  await user.type(await screen.findByLabelText(/température de la bière/i), tempC);
  await user.type(screen.getByLabelText(/pression relevée/i), pressureBar);
}

beforeEach(() => {
  calls = [];
  lines = [line()];
  useSession.setState({ user: USER });
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useSession.setState({ user: null });
});

describe("relevé de carbonatation forcée (#273)", () => {
  describe("éligibilité du formulaire", () => {
    it("offre la saisie sur une ligne en carbonatation forcée", async () => {
      renderPackaging();
      await panelReady();

      expect(await screen.findByLabelText(/pression relevée/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /enregistrer le relevé/i })).toBeInTheDocument();
    });

    it("ne l'offre PAS sur une refermentation en bouteille (l'API répondrait 409)", async () => {
      lines = [
        line({
          id: "pl-bottle",
          conditioningMethod: "REFERMENTATION",
          co2TargetVolumes: null,
          containerVolumeL: 0.75,
          quantity: 60,
          availableForSaleDate: "2026-05-01",
          pendingReason: null,
        }),
      ];
      renderPackaging();
      await panelReady();

      expect(await screen.findByText(/refermentation en bouteille/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/pression relevée/i)).not.toBeInTheDocument();
    });

    it("ne l'offre PAS sur une ligne sans mise en condition, et dit pourquoi", async () => {
      lines = [
        line({
          id: "pl-none",
          conditioningMethod: "NONE",
          co2TargetVolumes: null,
          pendingReason: PENDING_NONE,
        }),
      ];
      renderPackaging();
      await panelReady();

      expect(await screen.findByText(PENDING_NONE)).toBeInTheDocument();
      expect(screen.queryByLabelText(/pression relevée/i)).not.toBeInTheDocument();
    });

    it("sans CO₂ visé, annonce qu'un relevé ne serait pas interprétable", async () => {
      lines = [line({ co2TargetVolumes: null })];
      renderPackaging();
      await panelReady();

      expect(await screen.findByText(/aucun co₂ visé/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/pression relevée/i)).not.toBeInTheDocument();
    });
  });

  describe("aide au réglage (avant relevé)", () => {
    it("affiche la pression cible ET sa tolérance à la température saisie", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await panelReady();

      await user.type(await screen.findByLabelText(/température de la bière/i), "4");
      await user.click(screen.getByRole("button", { name: /pression à régler/i }));

      // Cible 1,34 bar, tolérance 0,20 ⇒ fourchette 1,14 – 1,54.
      const hint = await screen.findByText(/régler le détendeur sur/i);
      expect(hint).toHaveTextContent("1,34 bar");
      expect(hint).toHaveTextContent("1,14");
      expect(hint).toHaveTextContent("1,54");
    });

    it("transmet le CO₂ visé de la ligne et la température saisie", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await panelReady();

      await user.type(await screen.findByLabelText(/température de la bière/i), "4");
      await user.click(screen.getByRole("button", { name: /pression à régler/i }));

      await waitFor(() => {
        const asked = calls.find((c) => c.url.endsWith("/packaging/pressure"));
        expect(asked?.body).toEqual({ co2TargetVolumes: 2.4, tempC: 4 });
      });
    });

    it("retire la cible dès que la température change — elle ne vaut plus", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await panelReady();

      const temp = await screen.findByLabelText(/température de la bière/i);
      await user.type(temp, "4");
      await user.click(screen.getByRole("button", { name: /pression à régler/i }));
      expect(await screen.findByText(/régler le détendeur sur/i)).toBeInTheDocument();

      // Garder 1,34 bar à l'écran ferait régler le détendeur sur une pression
      // qui ne correspond plus à la bière — l'erreur que l'aide doit éviter.
      await user.type(temp, "2");

      await waitFor(() =>
        expect(screen.queryByText(/régler le détendeur sur/i)).not.toBeInTheDocument(),
      );
    });

    it("n'appelle rien tant que la température n'est pas renseignée", async () => {
      renderPackaging();
      await panelReady();

      await screen.findByLabelText(/pression relevée/i);
      expect(screen.getByRole("button", { name: /pression à régler/i })).toBeDisabled();
      expect(calls.some((c) => c.url.endsWith("/packaging/pressure"))).toBe(false);
    });
  });

  describe("relevé atteignant la cible", () => {
    it("annonce que la mesure atteint la cible", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await panelReady();

      // 1,30 bar pour une cible de 1,34 ⇒ écart 0,04, dans la tolérance.
      await fillReading(user, "4", "1.3");
      await user.click(screen.getByRole("button", { name: /enregistrer le relevé/i }));

      expect(await screen.findByRole("status")).toHaveTextContent(/atteint la cible de 1,34 bar/i);
    });

    it("porte la date de mise en vente SUR LA LIGNE, après rechargement", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await panelReady();

      await fillReading(user, "4", "1.3");
      await user.click(screen.getByRole("button", { name: /enregistrer le relevé/i }));

      // L'invalidation du cache rejoue la liste : la date doit survivre au
      // rechargement, sinon elle n'existerait que le temps de l'écran. Elle
      // n'est affichée qu'à **un** endroit — la ligne en est la seule source.
      await waitFor(() =>
        expect(screen.getByText(/mise en vente estimée au/i)).toHaveTextContent("24 avr. 2026"),
      );
    });

    it("envoie l'altitude quand elle est renseignée", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await panelReady();

      await user.type(await screen.findByLabelText(/altitude du site/i), "500");
      await fillReading(user, "4", "1.3");
      await user.click(screen.getByRole("button", { name: /enregistrer le relevé/i }));

      await waitFor(() => {
        const posted = calls.find((c) => c.url.endsWith("/carbonation"));
        expect(posted?.body).toEqual({ pressureBar: 1.3, tempC: 4, altitudeFt: 500 });
      });
    });
  });

  describe("relevé en deçà de la cible", () => {
    it("est conservé et chiffré, SANS promettre de date", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await panelReady();

      // 0,80 bar pour une cible de 1,34 ⇒ 0,54 bar en deçà, hors tolérance.
      await fillReading(user, "4", "0.8");
      await user.click(screen.getByRole("button", { name: /enregistrer le relevé/i }));

      const verdict = await screen.findByRole("status");
      expect(verdict).toHaveTextContent("0,54 bar en deçà de la cible");
      expect(verdict).toHaveTextContent(/réajuste le détendeur/i);
      // Aucune date n'est annoncée : c'est précisément ce que le ticket exige.
      expect(screen.queryByText(/mise en vente estimée au/i)).not.toBeInTheDocument();
    });

    it("affiche le motif d'attente du serveur, tel quel", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await panelReady();

      await fillReading(user, "4", "0.8");
      await user.click(screen.getByRole("button", { name: /enregistrer le relevé/i }));

      expect(await screen.findByRole("status")).toHaveTextContent(PENDING_KEG);
    });

    it("le relevé enregistré reste lisible après rechargement de la ligne", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await panelReady();

      await fillReading(user, "4", "0.8");
      await user.click(screen.getByRole("button", { name: /enregistrer le relevé/i }));

      await waitFor(() =>
        expect(lines[0]).toMatchObject({ measuredPressureBar: 0.8, measuredTempC: 4 }),
      );
    });
  });

  describe("état d'attente à l'ouverture (rechargement à froid)", () => {
    it("annonce le motif d'attente d'un fût jamais relevé", async () => {
      renderPackaging();
      await panelReady();

      expect(await screen.findByText(PENDING_KEG)).toBeInTheDocument();
      expect(screen.queryByText(/mise en vente estimée au/i)).not.toBeInTheDocument();
    });

    it("réaffiche un relevé antérieur en deçà de la cible", async () => {
      lines = [line({ measuredPressureBar: 0.8, measuredTempC: 4 })];
      renderPackaging();
      await panelReady();

      expect(await screen.findByText(/dernier relevé/i)).toHaveTextContent("0,80 bar à 4 °C");
    });

    it("un brassin TERMINE atteint quand même le panneau (câblage #273)", async () => {
      renderPackaging();

      // Le conditionnement lui-même a mené le brassin en `TERMINE` : si la page
      // n'offrait plus que le refus de saisie, le relevé serait impossible.
      expect(await screen.findByText(/conditionnement.*est enregistré/i)).toBeInTheDocument();
      expect(await screen.findByLabelText(/pression relevée/i)).toBeInTheDocument();
    });
  });

  describe("wording ADR-11", () => {
    it("ne parle jamais de conformité ni de bière « prête à la vente »", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await panelReady();

      await fillReading(user, "4", "1.3");
      await user.click(screen.getByRole("button", { name: /enregistrer le relevé/i }));
      await screen.findByRole("status");

      const main = screen.getByRole("main");
      expect(within(main).queryByText(/conforme/i)).toBeNull();
      expect(within(main).queryByText(/prêt à la vente/i)).toBeNull();
      // Ce qui est affirmé, c'est que la mesure **atteint la cible**.
      expect(within(main).getByText(/atteint la cible/i)).toBeInTheDocument();
    });
  });
});

/**
 * Écran de **conditionnement** d'un brassin (M9-13) — l'écran qui referme la
 * boucle « recette → brassin → stock ».
 *
 * Monté via `App` sur `/batches/:id/packaging` : la garde d'état du brassin et
 * l'enchaînement saisie → récapitulatif → effet constaté font partie de ce qu'on
 * vérifie, et se perdraient en montant le seul formulaire.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
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

/** Chaîne des volumes : 30 L pré-ébullition (dénominateur du rendement §13.2). */
const VOLUMES = {
  preBoil: { volumeL: 30, source: "measured" },
  postBoil: { volumeL: 27, source: "estimated" },
  transferred: { volumeL: 25.5, source: "estimated" },
  pitched: { volumeL: 25, source: "measured" },
  packaged: { volumeL: null, source: "unknown" },
  evaporationL: 3,
  packagingYieldPercent: null,
  warnings: [],
};

function stockItem(over: Record<string, unknown> = {}) {
  return {
    id: "c-bottle",
    name: "Bouteille 75 cl",
    kind: "CONDITIONNEMENT",
    category: null,
    unit: "UNIT",
    attributes: { volumeL: 0.75 },
    defaultUnitCostCents: 60,
    reorderThreshold: null,
    isActive: true,
    createdAt: ISO,
    updatedAt: ISO,
    level: 100,
    reservedOutstanding: 0,
    available: 100,
    below: false,
    ...over,
  };
}

/** Catalogue de contenants : deux contenances + un consommable sans contenance. */
const CONTAINERS = [
  stockItem(),
  stockItem({
    id: "c-keg",
    name: "Fût 20 L",
    attributes: { volumeL: 20 },
    level: 2,
    available: 2,
  }),
  stockItem({ id: "c-cap", name: "Capsule 26 mm", attributes: null, available: 500 }),
];

let batchStatus: string;
/** Tient la réponse du brassin en suspens (observation de l'état de chargement). */
let holdBatch: boolean;
let containers: ReturnType<typeof stockItem>[];
let containersStatus: number;
let recordStatus: number;
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

      if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER }));
      if (path.endsWith("/api/stock/items")) {
        return Promise.resolve(
          containersStatus === 200
            ? json(200, { items: containers })
            : json(containersStatus, { error: { code: "OOPS", message: "ko" } }),
        );
      }
      if (path.endsWith("/volumes")) return Promise.resolve(json(200, { volumes: VOLUMES }));
      if (path.endsWith("/packaging") && method === "GET") {
        return Promise.resolve(json(200, { packaging: [] }));
      }
      if (path.endsWith("/packaging") && method === "POST") {
        if (recordStatus !== 201) {
          return Promise.resolve(json(recordStatus, { error: { code: "KO", message: "refusé" } }));
        }
        const lines = (body?.lines ?? []) as {
          containerItemId?: string;
          containerVolumeL: number;
          quantity: number;
        }[];
        // Comme le serveur (M9-08) : le brassin passe en `TERMINE`. Les
        // invalidations de cache le rechargent aussitôt — le récapitulatif doit
        // survivre à ce changement d'état.
        batchStatus = "TERMINE";
        return Promise.resolve(
          json(201, {
            productItemId: "prod-1",
            lines: lines.map((line, index) => ({
              id: `pl-${index}`,
              catalogItemId: "prod-1",
              containerItemId: line.containerItemId ?? null,
              containerVolumeL: line.containerVolumeL,
              quantity: line.quantity,
              conditioningMethod: "NONE",
              co2TargetVolumes: null,
              measuredPressureBar: null,
              measuredTempC: null,
              carbonationValidatedAt: null,
              availableForSaleAt: null,
              availableForSaleDate: null,
              packagedAt: ISO,
              note: null,
            })),
            movements: [],
            packagedVolumeL: lines.reduce((s, l) => s + l.containerVolumeL * l.quantity, 0),
            batchStatus: "TERMINE",
          }),
        );
      }
      if (/\/api\/batches\/[^/]+$/.exec(path) && method === "GET") {
        if (holdBatch) return new Promise<Response>(() => {});
        return Promise.resolve(json(200, { batch: { ...BATCH, status: batchStatus } }));
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

/** Renseigne la première ligne de contenants (volume rempli + quantité). */
async function fillFirstLine(
  user: ReturnType<typeof userEvent.setup>,
  volumeL: string,
  quantity: string,
) {
  const volume = screen.getAllByLabelText(/volume rempli par contenant/i)[0] as HTMLElement;
  const qty = screen.getAllByLabelText(/^quantité$/i)[0] as HTMLElement;
  await user.clear(volume);
  await user.type(volume, volumeL);
  await user.clear(qty);
  await user.type(qty, quantity);
}

/** Attend que le formulaire soit monté (le brassin est chargé). */
const formReady = () => screen.findByLabelText(/volume à répartir/i);

/**
 * Attend en plus que le catalogue de contenants soit arrivé : le formulaire
 * s'affiche avant lui, et interroger le sélecteur trop tôt le trouverait vide.
 */
async function containersReady() {
  await formReady();
  await screen.findByRole("option", { name: /fût 20 l/i });
}

beforeEach(() => {
  calls = [];
  batchStatus = "EN_FERMENTATION";
  holdBatch = false;
  containers = CONTAINERS;
  containersStatus = 200;
  recordStatus = 201;
  useSession.setState({ user: USER });
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useSession.setState({ user: null });
});

describe("écran de conditionnement (M9-13)", () => {
  describe("volume et rendement (§A)", () => {
    it("rappelle le volume ensemencé", async () => {
      renderPackaging();
      await formReady();
      await waitFor(() =>
        expect(screen.getByText(/volume ensemencé/i).parentElement).toHaveTextContent("25 L"),
      );
    });

    it("calcule le rendement en direct à la saisie des contenants", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await formReady();

      // 0,75 L × 24 = 18 L sur 30 L pré-ébullition ⇒ 60 %.
      await fillFirstLine(user, "0.75", "24");

      expect(screen.getByText(/volume réparti/i).parentElement).toHaveTextContent("18 L");
      expect(screen.getByText(/rendement de conditionnement/i).parentElement).toHaveTextContent(
        "60 %",
      );
    });

    it("affiche le reste non conditionné par rapport au volume à répartir (§B)", async () => {
      const user = userEvent.setup();
      renderPackaging();
      const target = await formReady();
      await user.type(target, "24");
      await fillFirstLine(user, "0.75", "24");

      // 24 L visés − 18 L répartis = 6 L de reste.
      expect(screen.getByText(/reste non conditionné/i).parentElement).toHaveTextContent("6 L");
    });

    it("avertit au-delà de 100 % SANS bloquer ni effacer la saisie", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await formReady();

      // 0,75 L × 50 = 37,5 L pour 30 L pré-ébullition ⇒ 125 %.
      await fillFirstLine(user, "0.75", "50");

      expect(screen.getByRole("alert")).toHaveTextContent(/supérieur à 100 %/i);
      // La valeur reste, et l'enregistrement reste possible : c'est un signal,
      // pas un verrou (l'opérateur peut avoir mesuré autrement).
      expect(screen.getAllByLabelText(/^quantité$/i)[0]).toHaveValue(50);
      expect(screen.getByRole("button", { name: /enregistrer le conditionnement/i })).toBeEnabled();
    });
  });

  describe("répartition en contenants (§B, §C)", () => {
    it("propose une répartition — grands contenants d'abord — puis la laisse modifiable", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await containersReady();
      await user.type(screen.getByLabelText(/volume à répartir/i), "24");

      await user.click(screen.getByRole("button", { name: /proposer une répartition/i }));

      // 24 L → 1 fût de 20 L, puis 5 bouteilles de 0,75 L (reste 0,25 L).
      const volumes = screen.getAllByLabelText(/volume rempli par contenant/i);
      const quantities = screen.getAllByLabelText(/^quantité$/i);
      expect(volumes[0]).toHaveValue(20);
      expect(quantities[0]).toHaveValue(1);
      expect(volumes[1]).toHaveValue(0.75);
      expect(quantities[1]).toHaveValue(5);
    });

    it("les quantités ENVOYÉES sont celles saisies après modification de la proposition", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await containersReady();
      await user.type(screen.getByLabelText(/volume à répartir/i), "24");
      await user.click(screen.getByRole("button", { name: /proposer une répartition/i }));

      // L'opérateur corrige la proposition : 4 bouteilles au lieu de 5.
      const quantities = screen.getAllByLabelText(/^quantité$/i);
      await user.clear(quantities[1] as HTMLElement);
      await user.type(quantities[1] as HTMLElement, "4");

      await user.click(screen.getByRole("button", { name: /enregistrer le conditionnement/i }));
      await user.click(await screen.findByRole("button", { name: /confirmer et enregistrer/i }));

      await waitFor(() => {
        const posted = calls.find((c) => c.method === "POST" && c.url.endsWith("/packaging"));
        expect(posted?.body?.lines).toEqual([
          { containerVolumeL: 20, quantity: 1, containerItemId: "c-keg" },
          { containerVolumeL: 0.75, quantity: 4, containerItemId: "c-bottle" },
        ]);
      });
    });

    it("le sélecteur de contenant offre une recherche qui filtre les options", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await containersReady();

      const select = screen.getAllByLabelText(/^contenant$/i)[0] as HTMLSelectElement;
      expect(within(select).getByRole("option", { name: /fût 20 l/i })).toBeInTheDocument();

      await user.type(screen.getAllByLabelText(/rechercher — contenant/i)[0] as HTMLElement, "fût");

      expect(within(select).getByRole("option", { name: /fût 20 l/i })).toBeInTheDocument();
      expect(within(select).queryByRole("option", { name: /bouteille 75 cl/i })).toBeNull();
    });

    it("n'offre que des contenants : un consommable sans contenance n'en est pas un", async () => {
      renderPackaging();
      await containersReady();

      const select = screen.getAllByLabelText(/^contenant$/i)[0] as HTMLSelectElement;
      expect(within(select).queryByRole("option", { name: /capsule/i })).toBeNull();
    });

    it("choisir un contenant pré-remplit sa contenance, qui reste modifiable", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await containersReady();

      await user.selectOptions(screen.getAllByLabelText(/^contenant$/i)[0] as HTMLElement, "c-keg");
      const volume = screen.getAllByLabelText(/volume rempli par contenant/i)[0] as HTMLElement;
      expect(volume).toHaveValue(20);

      // Un fût de 20 L peut n'en recevoir que 18 : la valeur reste éditable.
      await user.clear(volume);
      await user.type(volume, "18");
      expect(volume).toHaveValue(18);
    });
  });

  describe("contrôle des stocks de contenants (§D)", () => {
    it("avertit d'un stock insuffisant sans bloquer l'enregistrement", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await containersReady();

      // Le catalogue n'a que 2 fûts en stock.
      await user.selectOptions(screen.getAllByLabelText(/^contenant$/i)[0] as HTMLElement, "c-keg");
      const qty = screen.getAllByLabelText(/^quantité$/i)[0] as HTMLElement;
      await user.type(qty, "5");

      // Deux avertissements coexistent ici (stock, et rendement > 100 %) : on
      // vise celui du stock par son texte, pas par un rôle qu'ils partagent.
      expect(
        screen.getByText(/stock de « fût 20 l » insuffisant : il en manque 3/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /enregistrer le conditionnement/i })).toBeEnabled();
    });
  });

  describe("confirmation et effet (§E)", () => {
    it("affiche un récapitulatif avant d'écrire quoi que ce soit", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await formReady();
      await fillFirstLine(user, "0.75", "24");

      await user.click(screen.getByRole("button", { name: /enregistrer le conditionnement/i }));

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText(/volume conditionné enregistré/i).parentElement,
      ).toHaveTextContent("18 L");
      expect(within(dialog).getByText(/append-only/i)).toBeInTheDocument();
      // Rien n'est écrit tant que la confirmation n'est pas donnée.
      expect(calls.some((c) => c.method === "POST")).toBe(false);
    });

    it("« Revenir à la saisie » referme le récapitulatif sans écrire", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await formReady();
      await fillFirstLine(user, "0.75", "24");

      await user.click(screen.getByRole("button", { name: /enregistrer le conditionnement/i }));
      await user.click(await screen.findByRole("button", { name: /revenir à la saisie/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(calls.some((c) => c.method === "POST")).toBe(false);
    });

    it("après écriture, montre le produit fini créé et le passage en TERMINE", async () => {
      const user = userEvent.setup();
      renderPackaging();
      await formReady();
      await fillFirstLine(user, "0.75", "24");

      await user.click(screen.getByRole("button", { name: /enregistrer le conditionnement/i }));
      await user.click(await screen.findByRole("button", { name: /confirmer et enregistrer/i }));

      expect(await screen.findByText(/conditionnement enregistré/i)).toBeInTheDocument();
      expect(screen.getByText(/le produit fini est en stock/i)).toHaveTextContent("18 L");
      expect(screen.getByText(/le produit fini est en stock/i)).toHaveTextContent("24 contenants");
      // « Terminé » apparaît deux fois — badge d'en-tête (le brassin rechargé)
      // et récapitulatif — ce qui est précisément le comportement attendu :
      // le passage en `TERMINE` ne doit pas emporter le récapitulatif avec lui.
      expect(screen.getByText(/statut du brassin/i).parentElement).toHaveTextContent("Terminé");
      expect(screen.getAllByText("Terminé").length).toBeGreaterThan(1);
      expect(
        screen.getByRole("link", { name: /voir le stock de produits finis/i }),
      ).toHaveAttribute("href", "/stock");
    });

    it("un refus serveur est signalé sans perdre la saisie", async () => {
      recordStatus = 409;
      const user = userEvent.setup();
      renderPackaging();
      await formReady();
      await fillFirstLine(user, "0.75", "24");

      await user.click(screen.getByRole("button", { name: /enregistrer le conditionnement/i }));
      await user.click(await screen.findByRole("button", { name: /confirmer et enregistrer/i }));

      expect(await screen.findByText(/enregistrement impossible/i)).toBeInTheDocument();
      expect(screen.getAllByLabelText(/^quantité$/i)[0]).toHaveValue(24);
    });
  });

  describe("états vide / chargement / erreur (§F)", () => {
    it("chargement : l'écran annonce l'attente plutôt que de rester blanc", async () => {
      // Réponse du brassin tenue en suspens : c'est le seul moyen d'observer
      // l'état de chargement, qu'une réponse immédiate traverserait.
      holdBatch = true;
      renderPackaging();
      expect(await screen.findByText(/chargement du brassin/i)).toBeInTheDocument();
    });

    it("catalogue vide : explique ce qu'est un contenant et où en ajouter", async () => {
      containers = [];
      renderPackaging();
      await formReady();
      expect(await screen.findByText(/aucun contenant au catalogue/i)).toBeInTheDocument();
    });

    it("catalogue en erreur : la saisie manuelle reste possible", async () => {
      containersStatus = 500;
      renderPackaging();
      await formReady();
      expect(await screen.findByText(/impossible de charger les contenants/i)).toBeInTheDocument();
      expect(screen.getAllByLabelText(/volume rempli par contenant/i)[0]).toBeEnabled();
    });

    it("brassin déjà terminé : la saisie n'est pas offerte, l'état est expliqué", async () => {
      batchStatus = "TERMINE";
      renderPackaging();

      expect(await screen.findByText(/conditionnement indisponible/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/volume à répartir/i)).not.toBeInTheDocument();
    });
  });
});

/**
 * Atteignabilité du hub d'accueil (`HomePage`) — c'est par lui qu'on atteint la
 * quasi-totalité des écrans. Une tuile manquante ou mal câblée est un écran mort
 * sous CI verte (#273/#274/#276) : on monte donc l'écran via `App` sur la route
 * `/` (jamais le seul composant) pour vérifier la garde de session, le masquage
 * RBAC **et** la navigation réelle, pas seulement la fonction au bout.
 *
 * La matrice de rôles ci-dessous est dérivée des helpers de `@/lib/rbac`
 * (source de vérité), jamais déduite de mémoire.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type {
  BatchOverviewPage,
  ExternalTransaction,
  IntegrationAlert,
  Member,
  SkuMapping,
  User,
} from "@/lib/api";
import { useSession } from "@/stores/session";

/** Fabrique typée par le contrat d'API réel (`User`) — jamais un objet libre. */
function buildUser(roles: string[], over: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "u@brasso.test",
    displayName: "Testeur",
    roles,
    ...over,
  };
}

/** Anomalie ouverte typée par `IntegrationAlert` — seule sa présence compte ici. */
function buildAlert(over: Partial<IntegrationAlert> = {}): IntegrationAlert {
  return {
    id: "a1",
    type: "UNMAPPED_TRANSACTION",
    status: "OPEN",
    message: "Produit externe non mappé.",
    providerId: "sumup",
    provider: { label: "SumUp" },
    transactionId: "t1",
    transaction: {
      amountCents: 500,
      currency: "EUR",
      occurredAt: "2026-07-01T10:00:00.000Z",
      externalProductId: "sku-1",
    },
    createdAt: "2026-07-01T10:00:00.000Z",
    resolvedAt: null,
    ...over,
  };
}

const EMPTY_OVERVIEW: BatchOverviewPage = { items: [], total: 0, limit: 25, offset: 0 };

let currentUser: User;
let openAlerts: IntegrationAlert[];
let calls: { method: string; path: string }[];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Serveur simulé couvrant `/` **et** les écrans réellement atteints par clic
 * (Brassins/Membres/Caisse, cf. section C) — sans quoi le clic échouerait pour
 * une raison étrangère à la navigation elle-même.
 */
function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const path = url.split("?")[0] ?? url;
      calls.push({ method, path });

      if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: currentUser }));
      if (path.endsWith("/api/alerts") && method === "GET") {
        return Promise.resolve(json(200, { alerts: openAlerts }));
      }
      if (path.endsWith("/api/batches/overview") && method === "GET") {
        return Promise.resolve(json(200, EMPTY_OVERVIEW));
      }
      if (path.endsWith("/api/members") && method === "GET") {
        return Promise.resolve(json(200, { members: [] as Member[] }));
      }
      if (path.endsWith("/api/mappings") && method === "GET") {
        return Promise.resolve(json(200, { mappings: [] as SkuMapping[] }));
      }
      if (path.endsWith("/api/transactions") && method === "GET") {
        return Promise.resolve(json(200, { transactions: [] as ExternalTransaction[] }));
      }
      return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
    }),
  );
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Attend le hub monté (fin du bootstrap de session). */
const homeReady = () => screen.findByRole("heading", { name: /^Bonjour/ });

beforeEach(() => {
  calls = [];
  openAlerts = [];
  currentUser = buildUser(["brasseur"]);
  useSession.setState({ user: currentUser });
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useSession.setState({ user: null });
});

describe("hub d'accueil — atteignabilité et masquage RBAC", () => {
  describe("A. tuiles inconditionnelles (rôle brasseur)", () => {
    it("présente les 5 tuiles sans garde, chacune avec le href de sa route", async () => {
      renderHome();
      await homeReady();

      const tiles: [string, string][] = [
        ["Recettes", "/recipes"],
        ["Brassins", "/batches"],
        ["Équipement", "/equipment"],
        ["Stock", "/stock"],
        ["Calculateurs", "/calculators"],
      ];
      for (const [label, href] of tiles) {
        expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
      }
    });
  });

  describe("B. tuiles gardées — matrice par rôle", () => {
    const GATED = [
      "Membres",
      "Caisse",
      "Anomalies",
      "Affichage",
      "Exports",
      "Cotisations",
      "Audit",
    ];

    it("admin : voit les 7 tuiles gardées", async () => {
      currentUser = buildUser(["admin"]);
      useSession.setState({ user: currentUser });
      renderHome();
      await homeReady();

      for (const label of GATED) {
        expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      }
    });

    it("rgpd : voit Membres et Audit, pas Caisse/Anomalies/Affichage/Exports/Cotisations", async () => {
      currentUser = buildUser(["rgpd"]);
      useSession.setState({ user: currentUser });
      renderHome();
      await homeReady();

      expect(screen.getByRole("link", { name: "Membres" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Audit" })).toBeInTheDocument();
      for (const label of ["Caisse", "Anomalies", "Affichage", "Exports", "Cotisations"]) {
        expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
      }
    });

    it("caisse : voit Caisse/Anomalies/Affichage/Exports/Cotisations, pas Membres ni Audit", async () => {
      currentUser = buildUser(["caisse"]);
      useSession.setState({ user: currentUser });
      renderHome();
      await homeReady();

      for (const label of ["Caisse", "Anomalies", "Affichage", "Exports", "Cotisations"]) {
        expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      }
      expect(screen.queryByRole("link", { name: "Membres" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Audit" })).not.toBeInTheDocument();
    });

    it("brasseur : voit Caisse/Anomalies/Affichage/Exports/Cotisations, pas Membres ni Audit", async () => {
      // Rôle déjà posé par le beforeEach (brasseur).
      renderHome();
      await homeReady();

      for (const label of ["Caisse", "Anomalies", "Affichage", "Exports", "Cotisations"]) {
        expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      }
      expect(screen.queryByRole("link", { name: "Membres" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Audit" })).not.toBeInTheDocument();
    });
  });

  describe("C. atteignabilité réelle (clic → route cible, pas la redirection * → /)", () => {
    it("Brassins (inconditionnelle) mène réellement à /batches", async () => {
      renderHome();
      await homeReady();
      const user = userEvent.setup();

      await user.click(screen.getByRole("link", { name: "Brassins" }));

      // Distingue explicitement l'atterrissage réel du repli `*` → `/` : un
      // écran qui rendrait le hub à nouveau ferait échouer ces deux lignes.
      expect(await screen.findByRole("heading", { name: "Brassins" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /^Bonjour/ })).not.toBeInTheDocument();
    });

    it("Membres (admin) mène réellement à /members", async () => {
      currentUser = buildUser(["admin"]);
      useSession.setState({ user: currentUser });
      renderHome();
      await homeReady();
      const user = userEvent.setup();

      await user.click(screen.getByRole("link", { name: "Membres" }));

      expect(await screen.findByRole("heading", { name: "Membres" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /^Bonjour/ })).not.toBeInTheDocument();
    });

    it("Caisse (caisse) mène réellement à /cash", async () => {
      currentUser = buildUser(["caisse"]);
      useSession.setState({ user: currentUser });
      renderHome();
      await homeReady();
      const user = userEvent.setup();

      await user.click(screen.getByRole("link", { name: "Caisse" }));

      expect(await screen.findByRole("heading", { name: "Caisse" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /^Bonjour/ })).not.toBeInTheDocument();
    });
  });

  describe("D. compteur d'anomalies", () => {
    it("affiche le compte d'anomalies ouvertes sur la tuile, avec son aria-label", async () => {
      openAlerts = [buildAlert({ id: "a1" }), buildAlert({ id: "a2" }), buildAlert({ id: "a3" })];
      renderHome();
      await homeReady();

      expect(await screen.findByLabelText("3 anomalie(s) ouverte(s)")).toHaveTextContent("3");
    });

    it("n'affiche aucun badge à zéro anomalie ouverte", async () => {
      renderHome();
      await homeReady();

      await screen.findByRole("link", { name: "Anomalies" });
      expect(screen.queryByLabelText(/anomalie\(s\) ouverte\(s\)/i)).not.toBeInTheDocument();
    });

    it("n'appelle pas le serveur pour un rôle qui ne voit pas les anomalies (rgpd)", async () => {
      currentUser = buildUser(["rgpd"]);
      useSession.setState({ user: currentUser });
      renderHome();
      await homeReady();
      // Point d'ancrage du rendu complet du hub pour ce rôle (tuile toujours visible).
      await screen.findByRole("link", { name: "Membres" });

      expect(calls.some((c) => c.path.endsWith("/api/alerts"))).toBe(false);
    });
  });

  describe("E. identité de session", () => {
    it("affiche le nom, l'e-mail et les rôles de l'utilisateur", async () => {
      currentUser = buildUser(["admin", "caisse"], {
        displayName: "Cerise Dupont",
        email: "cerise@brasso.test",
      });
      useSession.setState({ user: currentUser });
      renderHome();

      expect(
        await screen.findByRole("heading", { name: "Bonjour Cerise Dupont" }),
      ).toBeInTheDocument();
      expect(screen.getByText("cerise@brasso.test")).toBeInTheDocument();
      expect(screen.getByText("admin")).toBeInTheDocument();
      expect(screen.getByText("caisse")).toBeInTheDocument();
    });

    it("un utilisateur sans aucun rôle voit « Aucun rôle attribué » et aucune tuile gardée", async () => {
      currentUser = buildUser([]);
      useSession.setState({ user: currentUser });
      renderHome();
      await homeReady();

      expect(screen.getByText("Aucun rôle attribué")).toBeInTheDocument();
      for (const label of [
        "Membres",
        "Caisse",
        "Anomalies",
        "Affichage",
        "Exports",
        "Cotisations",
        "Audit",
      ]) {
        expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
      }
    });
  });
});

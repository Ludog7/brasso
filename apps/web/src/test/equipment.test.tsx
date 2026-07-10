import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { EquipmentProfile } from "@/lib/api";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "brasseur@brasso.test",
  displayName: "Brasseur Test",
  roles: ["brasseur"],
};

// ── Faux serveur profils d'équipement (état en mémoire) ──────────────────────

let profiles: EquipmentProfile[] = [];
let nextId = 1;
let calls: { method: string; url: string; body: unknown }[] = [];

function makeProfile(over: Partial<EquipmentProfile> & { name: string }): EquipmentProfile {
  const id = `eq${nextId++}`;
  const now = new Date("2026-07-10T10:00:00Z").toISOString();
  return {
    id,
    nominalVolumeL: 50,
    deadspaceL: 0,
    transferLossL: 0,
    evaporationRateLPerHour: 0,
    grainAbsorptionLPerKg: 0,
    heatingPowerKw: null,
    thermalMassKjPerC: null,
    waterProfiles: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

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
    const query = new URL(url, "http://localhost").searchParams;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (path.endsWith("/auth/me")) {
      return Promise.resolve(json(200, { user: USER }));
    }

    if (path.endsWith("/api/equipment-profiles") && method === "GET") {
      const active = query.get("active");
      const filtered =
        active == null ? profiles : profiles.filter((p) => String(p.isActive) === active);
      return Promise.resolve(json(200, { profiles: filtered }));
    }

    if (path.endsWith("/api/equipment-profiles") && method === "POST") {
      const created = makeProfile(body);
      profiles.push(created);
      return Promise.resolve(json(201, { profile: created }));
    }

    const deactivateId = /equipment-profiles\/([^/]+)\/deactivate$/.exec(path)?.[1];
    if (deactivateId && method === "POST") {
      const found = profiles.find((p) => p.id === deactivateId);
      if (!found) {
        return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
      }
      const updated = { ...found, isActive: false, updatedAt: new Date().toISOString() };
      profiles = profiles.map((p) => (p.id === deactivateId ? updated : p));
      return Promise.resolve(json(200, { profile: updated }));
    }

    const id = /\/api\/equipment-profiles\/([^/]+)$/.exec(path)?.[1];
    if (id) {
      const found = profiles.find((p) => p.id === id);
      if (!found) {
        return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
      }
      if (method === "GET") {
        return Promise.resolve(json(200, { profile: found }));
      }
      if (method === "PATCH") {
        const updated = { ...found, ...body, updatedAt: new Date().toISOString() };
        profiles = profiles.map((p) => (p.id === id ? updated : p));
        return Promise.resolve(json(200, { profile: updated }));
      }
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
  profiles = [];
  nextId = 1;
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("liste des profils d'équipement", () => {
  it("affiche les profils renvoyés par l'API avec leur volume et leur état", async () => {
    profiles.push(makeProfile({ name: "Cuve 50L", nominalVolumeL: 50 }));
    profiles.push(makeProfile({ name: "Pilote 20L", nominalVolumeL: 20, isActive: false }));
    installFetch();
    renderApp(["/equipment"]);

    expect(await screen.findByText("Cuve 50L")).toBeInTheDocument();
    expect(screen.getByText("Pilote 20L")).toBeInTheDocument();
    expect(screen.getByText(/Volume nominal : 50 L/)).toBeInTheDocument();
    expect(screen.getByText("Inactif")).toBeInTheDocument();
  });

  it("liste vide → invite à créer un profil", async () => {
    installFetch();
    renderApp(["/equipment"]);

    expect(await screen.findByText(/aucun profil d'équipement/i)).toBeInTheDocument();
  });
});

describe("création d'un profil d'équipement", () => {
  it("POST le profil puis revient à la liste", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp(["/equipment/new"]);

    await user.type(await screen.findByLabelText(/nom du profil/i), "Cuve 50L");
    await user.type(screen.getByLabelText(/volume nominal/i), "50");
    await user.click(screen.getByRole("button", { name: /créer le profil/i }));

    // Retour sur la liste (en-tête « Équipement ») avec le profil créé visible.
    expect(await screen.findByRole("heading", { name: "Équipement" })).toBeInTheDocument();
    expect(await screen.findByText("Cuve 50L")).toBeInTheDocument();

    const post = calls.find(
      (c) => c.method === "POST" && c.url.endsWith("/api/equipment-profiles"),
    );
    expect(post?.body).toMatchObject({ name: "Cuve 50L", nominalVolumeL: 50, deadspaceL: 0 });
  });

  it("volume ≤ 0 → message d'erreur, aucun POST", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp(["/equipment/new"]);

    await user.type(await screen.findByLabelText(/nom du profil/i), "Cuve");
    await user.type(screen.getByLabelText(/volume nominal/i), "0");
    await user.click(screen.getByRole("button", { name: /créer le profil/i }));

    expect(
      await screen.findByText(/volume nominal doit être strictement positif/i),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toBeUndefined();
  });
});

describe("désactivation d'un profil", () => {
  it("POST /deactivate puis le profil passe inactif", async () => {
    profiles.push(makeProfile({ name: "Cuve 50L", nominalVolumeL: 50, isActive: true }));
    installFetch();
    const user = userEvent.setup();
    renderApp(["/equipment"]);

    await screen.findByText("Cuve 50L");
    await user.click(screen.getByRole("button", { name: /désactiver/i }));

    expect(await screen.findByText("Inactif")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/deactivate"));
    expect(post).toBeTruthy();
  });
});

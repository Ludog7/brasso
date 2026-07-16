import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { ConsentEvent, ConsentState, Member } from "@/lib/api";
import { useSession } from "@/stores/session";

let userRoles = ["admin"];
const USER = () => ({ id: "u1", email: "u@brasso.test", displayName: "Test", roles: userRoles });

let members: Member[] = [];
let consentEvents: Record<string, ConsentEvent[]> = {};
let calls: { method: string; url: string; path: string; body: unknown }[] = [];

function makeMember(
  over: Partial<Member> & { id: string; memberNumber: string; firstName: string; lastName: string },
): Member {
  const now = new Date("2026-07-15T10:00:00Z").toISOString();
  return {
    email: null,
    phone: null,
    address: null,
    birthDate: null,
    membership: "EN_RETARD",
    roles: [],
    lastContributionAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function consentState(id: string): ConsentState {
  const events = consentEvents[id] ?? [];
  const current: ConsentState["current"] = {
    COMMUNICATION: null,
    PHOTOS: null,
    NOTIFICATIONS_LEGALES: null,
  };
  for (const e of events) current[e.type] = { granted: e.granted, at: e.createdAt };
  return { current, history: events };
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
    calls.push({ method, url, path, body });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER() }));

    if (path.endsWith("/api/members") && method === "GET") {
      const search = query.get("search")?.toLowerCase();
      const membership = query.get("membership");
      let filtered = members;
      if (search) {
        filtered = filtered.filter((m) =>
          [m.lastName, m.firstName, m.memberNumber, m.email ?? ""].some((v) =>
            v.toLowerCase().includes(search),
          ),
        );
      }
      if (membership) filtered = filtered.filter((m) => m.membership === membership);
      return Promise.resolve(json(200, { members: filtered, total: filtered.length }));
    }
    if (path.endsWith("/api/members") && method === "POST") {
      const created = makeMember({
        id: `m${members.length + 1}`,
        memberNumber: body.memberNumber,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        roles: body.roles ?? [],
      });
      members.push(created);
      return Promise.resolve(json(201, { member: created }));
    }

    const consentMatch = /\/api\/members\/([^/]+)\/consents$/.exec(path);
    if (consentMatch) {
      const id = consentMatch[1]!;
      if (method === "GET") return Promise.resolve(json(200, consentState(id)));
      if (method === "POST") {
        const event: ConsentEvent = {
          id: `c${(consentEvents[id]?.length ?? 0) + 1}`,
          type: body.type,
          granted: body.granted,
          createdAt: new Date("2026-07-16T09:00:00Z").toISOString(),
        };
        consentEvents[id] = [...(consentEvents[id] ?? []), event];
        return Promise.resolve(json(201, { event }));
      }
    }

    const idMatch = /\/api\/members\/([^/]+)$/.exec(path);
    if (idMatch && method === "PATCH") {
      const idx = members.findIndex((m) => m.id === idMatch[1]);
      if (idx >= 0) {
        members[idx] = { ...members[idx], ...body } as Member;
        return Promise.resolve(json(200, { member: members[idx] }));
      }
    }

    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/members"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  userRoles = ["admin"];
  members = [
    makeMember({
      id: "m-ada",
      memberNumber: "A-001",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.org",
      membership: "EN_RETARD",
    }),
    makeMember({
      id: "m-grace",
      memberNumber: "A-002",
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@example.org",
      membership: "A_JOUR",
      roles: ["TRESORIER"],
    }),
  ];
  consentEvents = {};
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const membersGetCount = () =>
  calls.filter((c) => c.method === "GET" && c.path.endsWith("/api/members")).length;

describe("fichier membres — liste & recherche (M6-09)", () => {
  it("liste les membres avec badge de statut (A_JOUR vs EN_RETARD)", async () => {
    installFetch();
    renderApp();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    const graceRow = screen.getByText("Grace Hopper").closest("tr")!;
    expect(within(graceRow).getByText("À jour")).toBeInTheDocument();
    const adaRow = screen.getByText("Ada Lovelace").closest("tr")!;
    expect(within(adaRow).getByText("En retard")).toBeInTheDocument();
  });

  it("recherche par nom → GET filtré côté serveur", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Ada Lovelace");
    await user.type(screen.getByLabelText("Rechercher"), "Hopper");

    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "GET" && c.url.includes("search=Hopper"))).toBe(true);
  });

  it("masque l'écran pour un rôle non habilité (ni admin ni rgpd)", async () => {
    userRoles = ["brasseur"];
    installFetch();
    renderApp();

    expect(await screen.findByText(/accès réservé aux rôles habilités/i)).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nouveau membre/i })).not.toBeInTheDocument();
    // Pas de requête membres quand l'écran est masqué (query désactivée).
    expect(membersGetCount()).toBe(0);
  });
});

describe("fichier membres — écriture (M6-09)", () => {
  it("crée un membre (POST identité + numéro d'adhérent)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /nouveau membre/i }));
    await user.type(screen.getByLabelText("N° adhérent"), "A-003");
    await user.type(screen.getByLabelText("Prénom"), "Katherine");
    await user.type(screen.getByLabelText("Nom"), "Johnson");
    await user.click(screen.getByRole("checkbox", { name: /adhérent/i }));
    await user.click(screen.getByRole("button", { name: /créer le membre/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/api/members"));
      expect(post?.body).toMatchObject({
        memberNumber: "A-003",
        firstName: "Katherine",
        lastName: "Johnson",
        roles: ["ADHERENT"],
      });
    });
  });

  it("édite un membre : le numéro d'adhérent est verrouillé, le PATCH ne l'envoie pas", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Ada Lovelace" }));
    expect(screen.getByLabelText("N° adhérent")).toBeDisabled();

    const last = screen.getByLabelText("Nom");
    await user.clear(last);
    await user.type(last, "Byron");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === "PATCH");
      expect(patch?.body).toMatchObject({ firstName: "Ada", lastName: "Byron" });
      expect((patch?.body as { memberNumber?: unknown }).memberNumber).toBeUndefined();
    });
  });

  it("bascule un consentement (POST événement) puis relit l'état courant", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Grace Hopper" }));
    // Panneau consentements chargé (état initial : non renseigné).
    const consentSection = await screen.findByRole("region", { name: /consentements/i });
    const commRow = within(consentSection).getByText("Communications").closest("li")!;
    await user.click(within(commRow).getByRole("button", { name: /accorder/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && /\/consents$/.test(c.path));
      expect(post?.body).toMatchObject({ type: "COMMUNICATION", granted: true });
    });
    // Relecture : le consentement apparaît désormais accordé (bouton devient « Retirer »).
    await waitFor(() =>
      expect(within(commRow).getByRole("button", { name: /retirer/i })).toBeInTheDocument(),
    );
  });
});

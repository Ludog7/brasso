import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { Contribution, Member } from "@/lib/api";
import { useSession } from "@/stores/session";

let userRoles = ["admin"];
const USER = () => ({ id: "u1", email: "u@brasso.test", displayName: "Test", roles: userRoles });

let contributions: Contribution[] = [];
let members: Member[] = [];
let calls: { method: string; path: string; body: unknown }[] = [];

function makeMember(over: Partial<Member> & { id: string; memberNumber: string }): Member {
  const now = new Date("2026-07-15T10:00:00Z").toISOString();
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.org",
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
    calls.push({ method, path, body });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER() }));

    if (path.endsWith("/api/transactions") && method === "GET") {
      const status = query.get("status");
      const filtered = status ? contributions.filter((c) => c.status === status) : contributions;
      return Promise.resolve(json(200, { transactions: filtered, total: filtered.length }));
    }
    if (path.endsWith("/api/members") && method === "GET") {
      const search = query.get("search")?.toLowerCase();
      const filtered = search
        ? members.filter((m) =>
            [m.lastName, m.firstName, m.memberNumber].some((v) => v.toLowerCase().includes(search)),
          )
        : members;
      return Promise.resolve(json(200, { members: filtered, total: filtered.length }));
    }
    const reconcileMatch = /\/api\/transactions\/([^/]+)\/reconcile$/.exec(path);
    if (reconcileMatch && method === "POST") {
      const tx = contributions.find((c) => c.id === reconcileMatch[1]);
      if (tx) {
        tx.status = "MAPPED";
        tx.memberId = body.memberId;
        const member = members.find((m) => m.id === body.memberId);
        if (member) member.membership = "A_JOUR";
        return Promise.resolve(json(200, { transaction: tx }));
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
      <MemoryRouter initialEntries={["/contributions"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  userRoles = ["admin"];
  contributions = [
    {
      id: "t1",
      externalId: "evt-001",
      amountCents: 2500,
      currency: "EUR",
      paymentMethod: "Card",
      status: "UNMAPPED",
      memberId: null,
      occurredAt: new Date("2026-07-14T10:00:00Z").toISOString(),
    },
  ];
  members = [makeMember({ id: "m-ada", memberNumber: "A-001" })];
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rapprochement des cotisations (M6-10)", () => {
  it("liste les cotisations à rapprocher (montant + référence)", async () => {
    installFetch();
    renderApp();

    expect(await screen.findByText("evt-001")).toBeInTheDocument();
    expect(screen.getByText("25,00 €")).toBeInTheDocument();
  });

  it("assigne une cotisation à un membre → POST reconcile + confirmation", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /rapprocher/i }));
    // Dialogue d'assignation : le membre est EN_RETARD avant rapprochement.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("En retard")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /assigner à ada lovelace/i }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && /\/reconcile$/.test(c.path))).toBe(true),
    );
    const post = calls.find((c) => c.method === "POST" && /\/reconcile$/.test(c.path));
    expect(post?.body).toMatchObject({ memberId: "m-ada" });
    // Confirmation + cotisation retirée de la liste (rafraîchie).
    expect(await screen.findByText(/le membre est désormais à jour/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/aucune cotisation à rapprocher/i)).toBeInTheDocument(),
    );
  });

  it("masque le bouton de rapprochement pour un lecteur seul (caisse)", async () => {
    userRoles = ["caisse"];
    installFetch();
    renderApp();

    expect(await screen.findByText("evt-001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rapprocher/i })).not.toBeInTheDocument();
  });
});

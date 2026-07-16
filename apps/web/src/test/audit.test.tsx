import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { AuditEntry } from "@/lib/api";
import { useSession } from "@/stores/session";

let userRoles = ["admin"];
const USER = () => ({ id: "u1", email: "u@brasso.test", displayName: "Test", roles: userRoles });

let entries: AuditEntry[] = [];
let calls: { method: string; url: string; path: string }[] = [];

function entry(over: Partial<AuditEntry> & { id: string; action: string }): AuditEntry {
  return {
    userId: "u1",
    resourceType: "member",
    resourceId: "m-ada",
    memberId: "m-ada",
    ip: "127.0.0.1",
    metadata: null,
    createdAt: new Date("2026-07-16T09:00:00Z").toISOString(),
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
    calls.push({ method, url, path });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER() }));
    if (path.endsWith("/api/audit")) {
      const action = query.get("action");
      const filtered = action ? entries.filter((e) => e.action === action) : entries;
      return Promise.resolve(
        json(200, { entries: filtered, total: filtered.length, limit: 50, offset: 0 }),
      );
    }
    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/audit"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const auditGetCount = () =>
  calls.filter((c) => c.method === "GET" && c.path.endsWith("/api/audit")).length;

beforeEach(() => {
  userRoles = ["admin"];
  entries = [
    entry({ id: "a1", action: "MEMBER_CREATE" }),
    entry({ id: "a2", action: "CONTRIBUTION_RECONCILE", resourceType: "transaction" }),
  ];
  calls = [];
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("journal d'audit (M6-10)", () => {
  it("liste les entrées et filtre par action", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    // Assertions scopées au tableau : les noms d'action apparaissent aussi dans
    // les options du filtre (à ignorer).
    const table = await screen.findByRole("table");
    expect(within(table).getByText("MEMBER_CREATE")).toBeInTheDocument();
    expect(within(table).getByText("CONTRIBUTION_RECONCILE")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Action"), "MEMBER_CREATE");

    await waitFor(() =>
      expect(
        within(screen.getByRole("table")).queryByText("CONTRIBUTION_RECONCILE"),
      ).not.toBeInTheDocument(),
    );
    expect(within(screen.getByRole("table")).getByText("MEMBER_CREATE")).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("action=MEMBER_CREATE"))).toBe(true);
  });

  it("masque le journal pour un rôle non habilité (brasseur)", async () => {
    userRoles = ["brasseur"];
    installFetch();
    renderApp();

    expect(await screen.findByText(/accès réservé aux rôles habilités/i)).toBeInTheDocument();
    expect(screen.queryByText("MEMBER_CREATE")).not.toBeInTheDocument();
    expect(auditGetCount()).toBe(0);
  });
});

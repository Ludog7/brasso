import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import type { Member } from "@/lib/api";
import { useSession } from "@/stores/session";

let userRoles = ["rgpd"];
const USER = () => ({ id: "u1", email: "u@brasso.test", displayName: "Test", roles: userRoles });

let members: Member[] = [];
let calls: { method: string; path: string; body: unknown }[] = [];
let createObjectURL: ReturnType<typeof vi.fn>;

function makeMember(over: Partial<Member> & { id: string; memberNumber: string }): Member {
  const now = new Date("2026-07-15T10:00:00Z").toISOString();
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.org",
    phone: null,
    address: null,
    birthDate: null,
    membership: "A_JOUR",
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
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER() }));
    if (path.endsWith("/api/members") && method === "GET")
      return Promise.resolve(json(200, { members, total: members.length }));

    const exportMatch = /\/api\/members\/([^/]+)\/export$/.exec(path);
    if (exportMatch) return Promise.resolve(json(200, { schemaVersion: 1, member: {} }));

    const consentMatch = /\/api\/members\/([^/]+)\/consents$/.exec(path);
    if (consentMatch && method === "GET")
      return Promise.resolve(
        json(200, {
          current: { COMMUNICATION: null, PHOTOS: null, NOTIFICATIONS_LEGALES: null },
          history: [],
        }),
      );

    const anonMatch = /\/api\/members\/([^/]+)\/anonymize$/.exec(path);
    if (anonMatch && method === "POST") {
      const idx = members.findIndex((m) => m.id === anonMatch[1]);
      if (idx >= 0) {
        members[idx] = {
          ...members[idx],
          firstName: "Anonyme",
          lastName: "Anonymisé",
          email: null,
        } as Member;
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
  userRoles = ["rgpd"];
  members = [makeMember({ id: "m-ada", memberNumber: "A-001" })];
  calls = [];
  createObjectURL = vi.fn(() => "blob:mock");
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  // Évite la tentative de navigation jsdom sur le lien de téléchargement.
  HTMLAnchorElement.prototype.click = vi.fn();
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("outils RGPD (M6-10)", () => {
  it("exporte le dossier → GET export + téléchargement déclenché", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Ada Lovelace" }));
    await user.click(await screen.findByRole("button", { name: /exporter le dossier/i }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "GET" && /\/export$/.test(c.path))).toBe(true),
    );
    expect(createObjectURL).toHaveBeenCalled();
  });

  it("anonymise avec confirmation par re-saisie du numéro → POST + fiche effacée", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Ada Lovelace" }));
    await user.click(await screen.findByRole("button", { name: /anonymiser…/i }));

    // Bouton désactivé tant que le numéro n'est pas re-saisi.
    const confirmBtn = screen.getByRole("button", { name: /anonymiser définitivement/i });
    expect(confirmBtn).toBeDisabled();
    await user.type(screen.getByLabelText(/saisissez le numéro d'adhérent/i), "A-001");
    expect(confirmBtn).toBeEnabled();
    await user.click(confirmBtn);

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && /\/anonymize$/.test(c.path))).toBe(true),
    );
    // Liste rafraîchie : PII effacées.
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument());
    expect(screen.getByText("Anonyme Anonymisé")).toBeInTheDocument();
  });

  it("masque les outils RGPD pour un rôle non-rgpd (admin)", async () => {
    userRoles = ["admin"];
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Ada Lovelace" }));
    // Fiche ouverte (admin gère les membres) mais aucun outil RGPD.
    expect(await screen.findByLabelText("N° adhérent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /exporter le dossier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /anonymiser/i })).not.toBeInTheDocument();
  });
});

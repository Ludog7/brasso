import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { useSession } from "@/stores/session";

let userRoles = ["caisse"];
const USER = () => ({ id: "u1", email: "u@brasso.test", displayName: "Test", roles: userRoles });

let calls: { method: string; url: string; path: string }[] = [];
let exportStatus = 200;
let downloadName = "";
let createObjectURL: ReturnType<typeof vi.fn>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Réponse CSV en pièce jointe (comme l'API exports M7-07). */
function csv(filename: string): Response {
  return new Response("date;montant\n2026-06-01;4.50\n", {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function installFetch() {
  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const path = url.split("?")[0] ?? url;
    calls.push({ method, url, path });

    if (path.endsWith("/auth/me")) return Promise.resolve(json(200, { user: USER() }));

    const exportMatch = /\/api\/exports\/([a-z]+)\.csv$/.exec(path);
    if (exportMatch && method === "GET") {
      if (exportStatus === 403) {
        return Promise.resolve(json(403, { error: { code: "FORBIDDEN", message: "refusé" } }));
      }
      return Promise.resolve(csv(`${exportMatch[1]}.csv`));
    }

    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp(initial = "/exports") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  userRoles = ["caisse"];
  calls = [];
  exportStatus = 200;
  downloadName = "";
  useSession.setState({ user: null });

  createObjectURL = vi.fn(() => "blob:mock");
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = vi.fn(function (this: HTMLAnchorElement) {
    downloadName = this.download;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exports CSV — téléchargement (M7-11)", () => {
  it("sélectionne le type + la période puis télécharge le bon endpoint avec from/to", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.selectOptions(await screen.findByLabelText("Type d'export"), "contributions");
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-06-30" } });
    await user.click(screen.getByRole("button", { name: /télécharger le csv/i }));

    await waitFor(() => {
      const call = calls.find((c) => c.path.endsWith("/api/exports/contributions.csv"));
      expect(call).toBeDefined();
      expect(call?.url).toContain("from=2026-06-01");
      expect(call?.url).toContain("to=2026-06-30");
    });
    // Le download est déclenché avec le nom de fichier proposé par l'API.
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
      expect(downloadName).toBe("contributions.csv");
    });
  });

  it("télécharge l'export ventes par défaut (endpoint sales.csv)", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /télécharger le csv/i }));

    await waitFor(() => {
      expect(calls.some((c) => c.path.endsWith("/api/exports/sales.csv"))).toBe(true);
      expect(downloadName).toBe("sales.csv");
    });
  });

  it("affiche un message d'accès refusé sur 403 (aucun download déclenché)", async () => {
    exportStatus = 403;
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /télécharger le csv/i }));

    expect(await screen.findByText(/accès refusé/i)).toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("masque l'écran pour rgpd (aucun appel export)", async () => {
    userRoles = ["rgpd"];
    installFetch();
    renderApp();

    expect(await screen.findByText(/accès réservé aux rôles habilités/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /télécharger le csv/i })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.includes("/api/exports/"))).toBe(false);
  });
});

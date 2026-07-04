import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { useSession } from "@/stores/session";

const USER = {
  id: "u1",
  email: "admin@brasso.test",
  displayName: "Admin Test",
  roles: ["admin"],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Faux serveur d'auth à état (le cookie est simulé par `loggedIn`). */
function installFetch() {
  let loggedIn = false;
  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.endsWith("/auth/me")) {
      return Promise.resolve(
        loggedIn
          ? json(200, { user: USER })
          : json(401, { error: { code: "UNAUTHENTICATED", message: "Authentification requise" } }),
      );
    }
    if (url.endsWith("/auth/login") && method === "POST") {
      const creds = JSON.parse(String(init?.body ?? "{}")) as { password?: string };
      if (creds.password === "correct") {
        loggedIn = true;
        return Promise.resolve(json(200, { user: USER }));
      }
      return Promise.resolve(
        json(401, { error: { code: "INVALID_CREDENTIALS", message: "Identifiants invalides" } }),
      );
    }
    if (url.endsWith("/auth/logout") && method === "POST") {
      loggedIn = false;
      return Promise.resolve(json(200, { ok: true }));
    }
    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSession.setState({ user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("écran de login", () => {
  it("non authentifié → redirige vers le formulaire de connexion", async () => {
    installFetch();
    renderApp();
    expect(await screen.findByRole("heading", { name: /connexion/i })).toBeInTheDocument();
  });

  it("cycle complet : login → identité affichée → logout → retour login", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText(/e-mail/i), "admin@brasso.test");
    await user.type(screen.getByLabelText(/mot de passe/i), "correct");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(await screen.findByText(/Admin Test/)).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument(); // badge de rôle

    await user.click(screen.getByRole("button", { name: /déconnexion/i }));
    expect(await screen.findByRole("heading", { name: /connexion/i })).toBeInTheDocument();
  });

  it("mauvais identifiants → message d'erreur, reste sur login", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText(/e-mail/i), "admin@brasso.test");
    await user.type(screen.getByLabelText(/mot de passe/i), "wrong");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalides/i);
    expect(screen.getByRole("heading", { name: /connexion/i })).toBeInTheDocument();
  });
});

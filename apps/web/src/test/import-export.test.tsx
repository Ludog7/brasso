import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImportRecipeButton } from "@/features/recipes/ImportRecipeButton";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Faux serveur d'import : `POST /api/recipes/import` reçoit le **corps brut** du
 * fichier (pas de JSON.parse). Un contenu marqué `INVALID` → 422 typé ; sinon 201.
 */
function installFetch() {
  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/recipes/import") && method === "POST") {
      const raw = String(init?.body ?? "");
      if (raw.includes("INVALID")) {
        return Promise.resolve(
          json(422, {
            error: {
              code: "IMPORT_INVALID",
              message: "BeerXML invalide",
              details: {
                messages: ["Champ obligatoire manquant : RECIPE/BATCH_SIZE."],
                paths: ["RECIPE/BATCH_SIZE"],
              },
            },
          }),
        );
      }
      return Promise.resolve(json(201, { recipe: { id: "rec-9", name: "Recette importée" } }));
    }
    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "introuvable" } }));
  });
  vi.stubGlobal("fetch", impl);
}

function renderButton() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/recipes"]}>
        <Routes>
          <Route path="/recipes" element={<ImportRecipeButton />} />
          <Route path="/recipes/:id/edit" element={<div>Éditeur du brouillon</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  installFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("import d'une recette (M2-12)", () => {
  it("fichier invalide → erreur affichée, puis fichier valide → redirection éditeur", async () => {
    const user = userEvent.setup();
    renderButton();
    const input = screen.getByLabelText("Importer une recette");

    // 1. Import refusé (422) : les chemins des champs fautifs sont restitués.
    await user.upload(
      input,
      new File(["<RECIPES><RECIPE>INVALID</RECIPE></RECIPES>"], "mauvais.xml", {
        type: "application/xml",
      }),
    );
    expect(await screen.findByText(/RECIPE\/BATCH_SIZE/)).toBeInTheDocument();

    // 2. Import réussi : redirection vers l'éditeur du DRAFT créé (l'erreur disparaît).
    await user.upload(
      input,
      new File(["<RECIPES><RECIPE>VALID</RECIPE></RECIPES>"], "ok.xml", {
        type: "application/xml",
      }),
    );
    expect(await screen.findByText("Éditeur du brouillon")).toBeInTheDocument();
    expect(screen.queryByText(/RECIPE\/BATCH_SIZE/)).not.toBeInTheDocument();
  });
});

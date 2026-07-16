/**
 * Coquille de page authentifiée partagée : en-tête (lien accueil + déconnexion) et
 * conteneur `main`. Mutualise le bandeau répété par les écrans (membres, audit,
 * cotisations…).
 */

import { Loader2, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useLogout } from "@/hooks/useAuth";
import { Button } from "@/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const logout = useLogout();
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link to="/" className="text-lg font-semibold">
          Brasso
        </Link>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-5" aria-hidden="true" />
          )}
          Déconnexion
        </Button>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}

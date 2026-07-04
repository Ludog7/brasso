import { Loader2, LogOut } from "lucide-react";

import { useLogout } from "@/hooks/useAuth";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";

export function HomePage() {
  const user = useSession((s) => s.user);
  const logout = useLogout();

  if (!user) {
    return null; // garde assurée par RequireAuth
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-lg font-semibold">Brasso</span>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-5" aria-hidden="true" />
          )}
          Déconnexion
        </Button>
      </header>

      <main className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Bonjour {user.displayName}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">Rôles</span>
            <div className="flex flex-wrap gap-2">
              {user.roles.length > 0 ? (
                user.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-md bg-primary/15 px-3 py-1 text-sm font-medium text-foreground"
                  >
                    {role}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Aucun rôle attribué</span>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

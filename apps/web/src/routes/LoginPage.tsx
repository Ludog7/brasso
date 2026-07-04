import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useLogin } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

export function LoginPage() {
  const user = useSession((s) => s.user);
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (user) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate("/", { replace: true }) });
  };

  const errorMessage = login.isError
    ? login.error instanceof ApiError && login.error.status === 401
      ? "Identifiants invalides."
      : "Connexion impossible. Vérifie ta connexion puis réessaie."
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>Accède à l'espace de gestion Brasso.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={login.isPending}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={login.isPending}
              />
            </div>

            {errorMessage ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
              >
                {errorMessage}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={login.isPending} className="mt-1 w-full">
              {login.isPending ? (
                <>
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                  Connexion…
                </>
              ) : (
                "Se connecter"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

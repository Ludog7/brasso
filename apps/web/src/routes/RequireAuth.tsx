import { Navigate, Outlet } from "react-router-dom";

import { useSession } from "@/stores/session";

/** Garde de route : redirige vers /login si aucune session UI n'est active. */
export function RequireAuth() {
  const user = useSession((s) => s.user);
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

import { useEffect } from "react";

/**
 * Avertit avant fermeture/rechargement de l'onglet tant que `when` est vrai
 * (modifications non enregistrées). La navigation interne (React Router) est,
 * elle, gardée explicitement par les contrôles de l'éditeur : l'app utilise un
 * `BrowserRouter` classique, sans data router, donc sans `useBlocker`.
 */
export function useBeforeUnload(when: boolean): void {
  useEffect(() => {
    if (!when) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
}

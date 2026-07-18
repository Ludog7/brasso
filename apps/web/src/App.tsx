import { Loader2 } from "lucide-react";
import { lazy, type ReactNode, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useBootstrapSession } from "@/hooks/useAuth";
import { RequireAuth } from "@/routes/RequireAuth";
import { Button } from "@/ui/button";

// Code-splitting par route (M8-07) : le bundle initial ne porte que le socle
// (bootstrap de session + garde d'auth + shell), chaque page tire son propre chunk
// via `import()`. Tous les chunks émis sont précachés par le service worker
// (workbox `globPatterns` inclut `**/*.js`) → le Jour J reste opérant hors ligne
// (ADR-08 ; navigateFallback = index.html déjà posé par vite-plugin-pwa).
// Les pages exportent un composant nommé → on l'adapte au `default` attendu par `lazy`.
const LoginPage = lazy(() => import("@/routes/LoginPage").then((m) => ({ default: m.LoginPage })));
const HomePage = lazy(() => import("@/routes/HomePage").then((m) => ({ default: m.HomePage })));
const RecipesListPage = lazy(() =>
  import("@/routes/recipes/RecipesListPage").then((m) => ({ default: m.RecipesListPage })),
);
const NewRecipePage = lazy(() =>
  import("@/routes/recipes/NewRecipePage").then((m) => ({ default: m.NewRecipePage })),
);
const RecipeDetailPage = lazy(() =>
  import("@/routes/recipes/RecipeDetailPage").then((m) => ({ default: m.RecipeDetailPage })),
);
const RecipeEditorPage = lazy(() =>
  import("@/routes/recipes/RecipeEditorPage").then((m) => ({ default: m.RecipeEditorPage })),
);
const EquipmentListPage = lazy(() =>
  import("@/routes/equipment/EquipmentListPage").then((m) => ({ default: m.EquipmentListPage })),
);
const NewEquipmentPage = lazy(() =>
  import("@/routes/equipment/NewEquipmentPage").then((m) => ({ default: m.NewEquipmentPage })),
);
const EditEquipmentPage = lazy(() =>
  import("@/routes/equipment/EditEquipmentPage").then((m) => ({ default: m.EditEquipmentPage })),
);
const StockPage = lazy(() =>
  import("@/routes/stock/StockPage").then((m) => ({ default: m.StockPage })),
);
const CalculatorsPage = lazy(() =>
  import("@/routes/calculators/CalculatorsPage").then((m) => ({ default: m.CalculatorsPage })),
);
const MembersPage = lazy(() =>
  import("@/routes/members/MembersPage").then((m) => ({ default: m.MembersPage })),
);
const ContributionsPage = lazy(() =>
  import("@/routes/contributions/ContributionsPage").then((m) => ({
    default: m.ContributionsPage,
  })),
);
const CashPage = lazy(() =>
  import("@/routes/cash/CashPage").then((m) => ({ default: m.CashPage })),
);
const AlertsPage = lazy(() =>
  import("@/routes/alerts/AlertsPage").then((m) => ({ default: m.AlertsPage })),
);
const ExportsPage = lazy(() =>
  import("@/routes/exports/ExportsPage").then((m) => ({ default: m.ExportsPage })),
);
const DisplayConfigPage = lazy(() =>
  import("@/routes/display/DisplayConfigPage").then((m) => ({ default: m.DisplayConfigPage })),
);
const DisplayScreenPage = lazy(() =>
  import("@/routes/display/DisplayScreenPage").then((m) => ({ default: m.DisplayScreenPage })),
);
const AuditPage = lazy(() =>
  import("@/routes/audit/AuditPage").then((m) => ({ default: m.AuditPage })),
);
// Vue « Brassins » (M9-10) — chargée à la demande comme les autres routes, pour
// ne pas alourdir le socle initial (budget de chunk surveillé, cf. DEV.md).
const BatchesListPage = lazy(() =>
  import("@/routes/batches/BatchesListPage").then((m) => ({ default: m.BatchesListPage })),
);
const PlanBatchPage = lazy(() =>
  import("@/routes/batches/PlanBatchPage").then((m) => ({ default: m.PlanBatchPage })),
);
const BatchDetailPage = lazy(() =>
  import("@/routes/batches/BatchDetailPage").then((m) => ({ default: m.BatchDetailPage })),
);
const DayScreen = lazy(() =>
  import("@/features/day/DayScreen").then((m) => ({ default: m.DayScreen })),
);

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
      {children}
    </div>
  );
}

/** Fallback de suspension pendant le chargement d'un chunk de route (cohérent avec le Splash). */
function RouteFallback() {
  return (
    <Splash>
      <Loader2 className="size-8 animate-spin" aria-hidden="true" />
      <span>Chargement…</span>
    </Splash>
  );
}

export function App() {
  const bootstrap = useBootstrapSession();

  if (bootstrap.isPending) {
    return (
      <Splash>
        <Loader2 className="size-8 animate-spin" aria-hidden="true" />
        <span>Chargement…</span>
      </Splash>
    );
  }

  if (bootstrap.isError) {
    return (
      <Splash>
        <p role="alert">Serveur injoignable.</p>
        <Button variant="outline" onClick={() => void bootstrap.refetch()}>
          Réessayer
        </Button>
      </Splash>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/recipes" element={<RecipesListPage />} />
          <Route path="/recipes/new" element={<NewRecipePage />} />
          <Route path="/recipes/:id" element={<RecipeDetailPage />} />
          <Route path="/recipes/:id/edit" element={<RecipeEditorPage />} />
          <Route path="/equipment" element={<EquipmentListPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/calculators" element={<CalculatorsPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/cash" element={<CashPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/exports" element={<ExportsPage />} />
          <Route path="/display" element={<DisplayConfigPage />} />
          <Route path="/display/screen/:id" element={<DisplayScreenPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/contributions" element={<ContributionsPage />} />
          <Route path="/equipment/new" element={<NewEquipmentPage />} />
          <Route path="/equipment/:id/edit" element={<EditEquipmentPage />} />
          <Route path="/batches" element={<BatchesListPage />} />
          <Route path="/batches/new/:recipeId" element={<PlanBatchPage />} />
          <Route path="/batches/:id" element={<BatchDetailPage />} />
          <Route path="/batches/:id/day" element={<DayScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

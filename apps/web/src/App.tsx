import { Loader2 } from "lucide-react";
import { type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { DayScreen } from "@/features/day/DayScreen";
import { useBootstrapSession } from "@/hooks/useAuth";
import { AlertsPage } from "@/routes/alerts/AlertsPage";
import { AuditPage } from "@/routes/audit/AuditPage";
import { BatchDetailPage } from "@/routes/batches/BatchDetailPage";
import { PlanBatchPage } from "@/routes/batches/PlanBatchPage";
import { CashPage } from "@/routes/cash/CashPage";
import { ContributionsPage } from "@/routes/contributions/ContributionsPage";
import { EditEquipmentPage } from "@/routes/equipment/EditEquipmentPage";
import { EquipmentListPage } from "@/routes/equipment/EquipmentListPage";
import { NewEquipmentPage } from "@/routes/equipment/NewEquipmentPage";
import { HomePage } from "@/routes/HomePage";
import { LoginPage } from "@/routes/LoginPage";
import { MembersPage } from "@/routes/members/MembersPage";
import { NewRecipePage } from "@/routes/recipes/NewRecipePage";
import { RecipeDetailPage } from "@/routes/recipes/RecipeDetailPage";
import { RecipeEditorPage } from "@/routes/recipes/RecipeEditorPage";
import { RecipesListPage } from "@/routes/recipes/RecipesListPage";
import { RequireAuth } from "@/routes/RequireAuth";
import { StockPage } from "@/routes/stock/StockPage";
import { Button } from "@/ui/button";

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
      {children}
    </div>
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
        <Route path="/members" element={<MembersPage />} />
        <Route path="/cash" element={<CashPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/contributions" element={<ContributionsPage />} />
        <Route path="/equipment/new" element={<NewEquipmentPage />} />
        <Route path="/equipment/:id/edit" element={<EditEquipmentPage />} />
        <Route path="/batches/new/:recipeId" element={<PlanBatchPage />} />
        <Route path="/batches/:id" element={<BatchDetailPage />} />
        <Route path="/batches/:id/day" element={<DayScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

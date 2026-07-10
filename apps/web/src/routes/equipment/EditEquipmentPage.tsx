import { ArrowLeft, Loader2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EquipmentProfileForm } from "@/features/equipment/EquipmentProfileForm";
import { useEquipmentProfile, useUpdateEquipmentProfile } from "@/features/equipment/hooks";
import { Button } from "@/ui/button";

export function EditEquipmentPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const profile = useEquipmentProfile(id);
  const update = useUpdateEquipmentProfile(id);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/equipment" aria-label="Retour à l'équipement">
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
        </Button>
        <span className="text-lg font-semibold">Modifier le profil d'équipement</span>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        {profile.isPending ? (
          <div className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            <span>Chargement du profil…</span>
          </div>
        ) : profile.isError ? (
          <div className="flex flex-col items-start gap-3 py-12">
            <p role="alert" className="text-destructive-foreground">
              Impossible de charger ce profil d'équipement.
            </p>
            <Button variant="outline" onClick={() => void profile.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : (
          <EquipmentProfileForm
            profile={profile.data}
            submitLabel="Enregistrer"
            isPending={update.isPending}
            isError={update.isError}
            onCancelHref="/equipment"
            onSubmit={(input) =>
              update.mutate(input, { onSuccess: () => navigate("/equipment", { replace: true }) })
            }
          />
        )}
      </main>
    </div>
  );
}

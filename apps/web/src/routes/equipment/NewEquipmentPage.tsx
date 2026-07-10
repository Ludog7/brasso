import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { EquipmentProfileForm } from "@/features/equipment/EquipmentProfileForm";
import { useCreateEquipmentProfile } from "@/features/equipment/hooks";
import { Button } from "@/ui/button";

export function NewEquipmentPage() {
  const navigate = useNavigate();
  const create = useCreateEquipmentProfile();

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/equipment" aria-label="Retour à l'équipement">
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
        </Button>
        <span className="text-lg font-semibold">Nouveau profil d'équipement</span>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <EquipmentProfileForm
          submitLabel="Créer le profil"
          isPending={create.isPending}
          isError={create.isError}
          onCancelHref="/equipment"
          onSubmit={(input) =>
            create.mutate(input, { onSuccess: () => navigate("/equipment", { replace: true }) })
          }
        />
      </main>
    </div>
  );
}

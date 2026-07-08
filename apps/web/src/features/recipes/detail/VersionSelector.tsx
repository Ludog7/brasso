import { useNavigate } from "react-router-dom";

import { useRecipeFamily } from "@/features/recipes/hooks";
import { STATUS_LABELS } from "@/features/recipes/labels";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

interface VersionSelectorProps {
  /** Famille de versions à lister (`familyId` partagé). */
  familyId: string;
  /** Recette actuellement affichée (option sélectionnée). */
  currentId: string;
}

/**
 * Sélecteur des versions d'une même famille (ADR-07). Liste `GET /recipes?familyId`,
 * ordonnée de la plus récente à la plus ancienne ; choisir une version navigue vers
 * sa page détail. Masqué tant qu'une seule version existe (rien à parcourir).
 */
export function VersionSelector({ familyId, currentId }: VersionSelectorProps) {
  const navigate = useNavigate();
  const family = useRecipeFamily(familyId);

  const versions = [...(family.data ?? [])].sort((a, b) => b.version - a.version);
  if (versions.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="version-selector">Version</Label>
      <Select
        id="version-selector"
        value={currentId}
        onChange={(e) => navigate(`/recipes/${e.target.value}`)}
        className="min-w-52"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.version} — {STATUS_LABELS[v.status]}
          </option>
        ))}
      </Select>
    </div>
  );
}

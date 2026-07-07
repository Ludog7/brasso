import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import type { RecipeEngine, RecipeStatus } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

import { ENGINE_LABELS, STATUS_LABELS, STATUS_TONE } from "./labels";

interface EditorHeaderProps {
  name: string;
  engine: RecipeEngine;
  status: RecipeStatus;
  version: number;
  /** Action du bouton retour (garde de navigation gérée par l'appelant). */
  onBack: () => void;
  /** Contenu aligné à droite (indicateur dirty, actions…). */
  right?: ReactNode;
}

/** En-tête commun de l'éditeur de recette (M2-05) — réutilisé par moteur. */
export function EditorHeader({ name, engine, status, version, onBack, right }: EditorHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
      <Button variant="ghost" size="icon" onClick={onBack} aria-label="Retour aux recettes">
        <ArrowLeft className="size-5" aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold">{name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{ENGINE_LABELS[engine]}</span>
          <span aria-hidden="true">·</span>
          <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>
          <Badge tone="accent">v{version}</Badge>
        </div>
      </div>
      {right}
    </header>
  );
}

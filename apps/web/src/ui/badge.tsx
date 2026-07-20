import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground",
      accent: "bg-primary/15 text-foreground",
      success: "bg-success/15 text-success",
      warning: "bg-warning/15 text-warning",
      // Signale ce qui appelle une action immédiate (échéance dépassée, M9-10).
      //
      // ⚠️ Seule tonalité qui n'atteint pas AA dans les deux thèmes, et c'est
      // assumé : `--destructive` est calibré comme couleur de **remplissage**,
      // pas de texte. En sombre, `--destructive-foreground` (quasi blanc) donne
      // 13:1 sur cette teinte ; en clair il devient invisible, d'où la bascule
      // ci-dessous vers `--destructive` — lisible, mais à 3,78:1. Ni l'aplat
      // plein ni la teinte ne passent AA dans les deux thèmes avec les valeurs
      // actuelles : le corriger exige de re-calibrer `--destructive`, ce qui
      // touche boutons et alertes → M10-07 (fondations), bug #292.
      destructive: "bg-destructive/15 text-destructive dark:text-destructive-foreground",
      muted: "border border-border text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}

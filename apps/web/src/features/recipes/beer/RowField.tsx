import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Champ compact d'une ligne d'ingrédient/étape : le `<label>` englobe le contrôle
 * (association implicite → accessible et interrogeable par libellé dans les tests).
 */
export function RowField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * Sélecteur de template d'écran (M7-12) : liste / tableau / cartes. Radios natifs
 * (accessibles clavier/lecteur d'écran, cibles ≥ 48 px, zéro drag-and-drop — §6).
 */

import type { DisplayTemplate } from "@/lib/api";
import { cn } from "@/lib/utils";

import { DISPLAY_TEMPLATES, TEMPLATE_LABELS } from "./labels";

export function TemplatePicker({
  value,
  onChange,
  name = "template",
}: {
  value: DisplayTemplate;
  onChange: (template: DisplayTemplate) => void;
  name?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Template</legend>
      <div className="flex flex-wrap gap-2">
        {DISPLAY_TEMPLATES.map((template) => (
          <label
            key={template}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors",
              value === template
                ? "border-primary bg-primary/10 text-foreground"
                : "border-input text-muted-foreground hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={name}
              value={template}
              checked={value === template}
              onChange={() => onChange(template)}
              className="size-4"
            />
            {TEMPLATE_LABELS[template]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Fusionne des classes conditionnelles Tailwind (dernier gagnant sur conflit). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

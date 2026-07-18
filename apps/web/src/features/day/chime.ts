/**
 * Signal **sonore** des alertes de houblonnage (M9-11, §E). En atelier, la
 * tablette est posée à distance et les mains sont prises : une alerte purement
 * visuelle se rate. Le son double l'affichage, il ne le remplace pas.
 *
 * Aucun fichier audio : un oscillateur Web Audio suffit et garde l'application
 * auto-portante (pas d'asset à charger — donc **audible hors ligne**, §F).
 * L'API est absente de jsdom et de certains navigateurs verrouillés : toute
 * indisponibilité est silencieuse, jamais une exception qui casserait le
 * dérouleur.
 */

/** Timbre du signal selon l'urgence. */
export type ChimeKind =
  /** Préavis : deux notes brèves et douces. */
  | "approach"
  /** Échéance atteinte : trois notes plus hautes, plus longues. */
  | "due";

interface Tone {
  readonly frequencyHz: number;
  readonly beeps: number;
  readonly beepMs: number;
  readonly gapMs: number;
  readonly volume: number;
}

const TONES: Record<ChimeKind, Tone> = {
  approach: { frequencyHz: 660, beeps: 2, beepMs: 90, gapMs: 110, volume: 0.12 },
  due: { frequencyHz: 990, beeps: 3, beepMs: 160, gapMs: 120, volume: 0.2 },
};

type AudioContextCtor = typeof AudioContext;

/** Constructeur Web Audio disponible, ou `undefined` (jsdom, navigateur bridé). */
function audioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor })
    .webkitAudioContext;
  return window.AudioContext ?? legacy;
}

/** Contexte partagé : en ouvrir un par bip épuiserait le quota du navigateur. */
let shared: AudioContext | null = null;

function context(): AudioContext | null {
  if (shared !== null) return shared;
  const Ctor = audioContextCtor();
  if (Ctor === undefined) return null;
  try {
    shared = new Ctor();
    return shared;
  } catch {
    // Contexte refusé (politique d'autoplay, quota) : on renonce au son.
    return null;
  }
}

/**
 * Émet le signal correspondant. Renvoie `true` si le son a pu être programmé —
 * l'appelant n'a rien à faire de cette information en production, elle rend le
 * comportement observable en test.
 */
export function playChime(kind: ChimeKind): boolean {
  const ctx = context();
  if (ctx === null) return false;

  const tone = TONES[kind];
  try {
    // Un contexte créé avant la première interaction démarre suspendu.
    void ctx.resume?.();
    const start = ctx.currentTime;
    for (let i = 0; i < tone.beeps; i += 1) {
      const at = start + (i * (tone.beepMs + tone.gapMs)) / 1000;
      const until = at + tone.beepMs / 1000;

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = tone.frequencyHz;
      // Enveloppe courte : un créneau nu « clique » désagréablement.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(tone.volume, at + 0.01);
      gain.gain.linearRampToValueAtTime(0, until);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(until);
    }
    return true;
  } catch {
    return false;
  }
}

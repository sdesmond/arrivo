import type { TripTint } from "@/data/types";

export const TRIP_TINTS: Record<string, TripTint> = {
  Tokyo: { hue: 8, light: "oklch(0.94 0.04 8)", dark: "oklch(0.28 0.05 8)" },
  Lisbon: { hue: 78, light: "oklch(0.95 0.04 78)", dark: "oklch(0.30 0.04 78)" },
  Oaxaca: { hue: 45, light: "oklch(0.94 0.05 45)", dark: "oklch(0.30 0.05 45)" },
  Reykjavik: { hue: 220, light: "oklch(0.94 0.03 220)", dark: "oklch(0.28 0.04 220)" },
  Marrakech: { hue: 30, light: "oklch(0.93 0.06 30)", dark: "oklch(0.30 0.06 30)" },
  Kyoto: { hue: 350, light: "oklch(0.94 0.04 350)", dark: "oklch(0.30 0.04 350)" },
  Athens: { hue: 200, light: "oklch(0.95 0.03 200)", dark: "oklch(0.30 0.04 200)" },
  Hanoi: { hue: 150, light: "oklch(0.94 0.04 150)", dark: "oklch(0.30 0.04 150)" },
  Patagonia: { hue: 245, light: "oklch(0.94 0.03 245)", dark: "oklch(0.28 0.04 245)" },
  Default: { hue: 60, light: "oklch(0.94 0.02 60)", dark: "oklch(0.30 0.02 60)" },
};

export function getTint(name: string, dark: boolean): string {
  const tint: TripTint = TRIP_TINTS[name] ?? TRIP_TINTS.Default;
  return dark ? tint.dark : tint.light;
}

export function getAvatarTint(initials: string): { bg: string; color: string } {
  const hues: Record<string, number> = {
    A: 30,
    B: 200,
    C: 150,
    D: 260,
    E: 45,
    F: 350,
    G: 100,
    H: 180,
    I: 220,
    J: 280,
    K: 80,
    L: 320,
    M: 8,
    N: 240,
    O: 60,
    P: 140,
    Q: 170,
    R: 0,
    S: 300,
    T: 200,
    U: 120,
    V: 250,
    W: 40,
    X: 310,
    Y: 70,
    Z: 190,
  };
  const letter = initials[0]?.toUpperCase() ?? "A";
  const hue = hues[letter] ?? 220;
  return {
    bg: `oklch(0.86 0.07 ${hue})`,
    color: `oklch(0.30 0.10 ${hue})`,
  };
}

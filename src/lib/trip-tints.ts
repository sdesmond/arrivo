import { TRIP_TINTS, type TripTint } from "@/data/trips";

export function getTint(name: string, dark: boolean): string {
  const tint: TripTint = TRIP_TINTS[name] ?? TRIP_TINTS.Default;
  return dark ? tint.dark : tint.light;
}

export function getAvatarTint(initials: string): { bg: string; color: string } {
  const hues: Record<string, number> = {
    A: 30, B: 200, C: 150, D: 260, E: 45,
    F: 350, G: 100, H: 180, I: 220, J: 280,
    K: 80, L: 320, M: 8, N: 240, O: 60,
    P: 140, Q: 170, R: 0, S: 300, T: 200,
    U: 120, V: 250, W: 40, X: 310, Y: 70, Z: 190,
  };
  const letter = initials[0]?.toUpperCase() ?? "A";
  const hue = hues[letter] ?? 220;
  return {
    bg: `oklch(0.86 0.07 ${hue})`,
    color: `oklch(0.30 0.10 ${hue})`,
  };
}

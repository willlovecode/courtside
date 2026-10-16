import type { PlayerPosition } from "@courtside/db";

const positions: Record<string, PlayerPosition> = {
  Rozgrywający: "setter",
  Przyjmujący: "outside_hitter",
  Atakujący: "opposite",
  Środkowy: "middle_blocker",
  Libero: "libero",
};

export function mapPosition(polish: string | null | undefined): PlayerPosition | null {
  if (!polish) return null;
  return positions[polish.trim()] ?? null;
}

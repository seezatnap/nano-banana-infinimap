export const TILE = Number(process.env.TILE_SIZE ?? 256);
export const ZMAX = Number(process.env.ZMAX ?? 8);

export const WORLD = (1 << ZMAX) * TILE;

export function parentOf(z: number, x: number, y: number) {
  return { z: z - 1, x: Math.floor(x / 2), y: Math.floor(y / 2) };
}

export function childrenOf(z: number, x: number, y: number) {
  const zc = z + 1;
  return [
    { z: zc, x: x * 2,     y: y * 2     },
    { z: zc, x: x * 2 + 1, y: y * 2     },
    { z: zc, x: x * 2,     y: y * 2 + 1 },
    { z: zc, x: x * 2 + 1, y: y * 2 + 1 },
  ];
}
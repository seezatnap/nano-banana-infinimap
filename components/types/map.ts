export interface TileCoord { x: number; y: number; }
export interface ScreenPoint { screenX: number; screenY: number; }
export interface SelectedTile extends TileCoord, ScreenPoint {}
export type TileStatus = "EMPTY" | "PENDING" | "READY";

export interface MetaResponse {
  status: TileStatus;
  hash?: string;
  updatedAt?: string | null;
}



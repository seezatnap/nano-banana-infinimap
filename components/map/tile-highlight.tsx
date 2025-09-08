"use client";

import { memo } from "react";
import { SelectedTile } from "../types/map";

interface TileHighlightProps {
  hoveredTile: SelectedTile | null;
  selectedTile: SelectedTile | null;
  isMaxZoom: boolean;
}

export const TileHighlight = memo(function TileHighlight({ hoveredTile, selectedTile, isMaxZoom }: TileHighlightProps) {
  if (!isMaxZoom) return null;

  return (
    <>
      {/* Hover highlight (visual only, non-interactive) */}
      {hoveredTile && !selectedTile && (
        <div
          className="absolute pointer-events-none animate-pulse"
          style={{
            left: hoveredTile.screenX - 128,
            top: hoveredTile.screenY - 128,
            width: 256,
            height: 256,
            background: 'rgba(59, 130, 246, 0.1)',
            border: '2px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            zIndex: 1000,
          }}
        />
      )}

      {/* Selection highlight */}
      {selectedTile && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: selectedTile.screenX - 128,
            top: selectedTile.screenY - 128,
            width: 256,
            height: 256,
            background: 'rgba(34, 197, 94, 0.1)',
            border: '2px solid rgba(34, 197, 94, 0.5)',
            borderRadius: '8px',
            zIndex: 1000,
          }}
        />
      )}
    </>
  );
});

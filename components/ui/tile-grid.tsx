"use client";

import { memo } from "react";
import { LoadingSpinner } from "./loading-spinner";

interface TileGridProps {
  tiles: string[][];
  loading?: boolean;
  onTileSelect?: (x: number, y: number, selected: boolean) => void;
  selectedPositions?: Set<string>;
  newTilePositions?: Set<string>;
  centerX?: number;
  centerY?: number;
  showControls?: boolean;
  className?: string;
}

export const TileGrid = memo(function TileGrid({
  tiles,
  loading = false,
  onTileSelect,
  selectedPositions = new Set(),
  newTilePositions = new Set(),
  centerX = 0,
  centerY = 0,
  showControls = false,
  className = ""
}: TileGridProps) {
  if (loading) {
    return (
      <div className={`rounded-2xl border bg-gray-100 p-2 flex items-center justify-center ${className}`}>
        <div className="relative overflow-hidden rounded-xl mx-auto w-full aspect-square" style={{ width: 'min(100%, 56vmin)' }}>
          <div className="absolute inset-0 grid place-items-center">
            <LoadingSpinner size="lg" text="Loading tiles..." />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border bg-gray-100 p-2 flex items-center justify-center ${className}`}>
      <div className={`relative overflow-hidden rounded-xl mx-auto w-full aspect-square ${showControls ? 'group' : ''}`} style={{ width: 'min(100%, 56vmin)' }}>
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0">
          {tiles.map((row, dy) =>
            row.map((tileData, dx) => {
              const tileX = centerX + dx - 1;
              const tileY = centerY + dy - 1;
              const key = `${tileX},${tileY}`;
              const isNew = newTilePositions.has(key);
              const isSelected = selectedPositions.has(key);

              return (
                <div key={`${dx}-${dy}`} className="relative w-full h-full">
                  <img 
                    src={tileData} 
                    alt={`Tile ${tileX},${tileY}`} 
                    className="block w-full h-full object-cover"
                    loading="lazy"
                  />
                  
                  {/* Tile controls overlay (shown on hover if showControls is true) */}
                  {showControls && onTileSelect && (
                    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
                      <div className="flex items-start justify-between p-1">
                        {/* Status tag */}
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-medium text-white shadow"
                          style={{ backgroundColor: !isNew ? '#3b82f6' : '#10b981' }}
                        >
                          {!isNew ? 'EXISTING' : 'NEW'}
                        </span>
                        
                        {/* Selection checkbox */}
                        <label className="flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-md px-1.5 py-0.5 shadow text-[10px] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="w-3 h-3"
                            checked={isSelected}
                            onChange={(e) => onTileSelect(tileX, tileY, e.target.checked)}
                          />
                          {isSelected ? 'Apply' : 'Skip'}
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});

"use client";

import { memo } from "react";
import { GlassPanel } from "../ui/glass-panel";

interface MapControlsProps {
  isMaxZoom: boolean;
  position?: {
    z: string | null;
    lat: string | null; 
    lng: string | null;
  } | null;
}

export const MapControls = memo(function MapControls({ isMaxZoom, position }: MapControlsProps) {
  return (
    <GlassPanel position="top-left" className="p-3 flex flex-col gap-2 min-w-[280px]">
      <div className="text-sm text-gray-700 font-medium">
        {isMaxZoom ? 
          "🎯 Hover to highlight, click to open menu" : 
          "🔍 Zoom to max level to interact with tiles"}
      </div>
      
      {position?.z && (
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Zoom:</span>
            <span className="font-mono">{position.z}</span>
          </div>
          <div className="flex justify-between">
            <span>Latitude:</span>
            <span className="font-mono">{position.lat}</span>
          </div>
          <div className="flex justify-between">
            <span>Longitude:</span>
            <span className="font-mono">{position.lng}</span>
          </div>
        </div>
      )}
    </GlassPanel>
  );
});

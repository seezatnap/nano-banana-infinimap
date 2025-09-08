"use client";

import { memo } from "react";
import { MapPin, Layers, Palette, Settings } from "lucide-react";

interface LeftPanelProps {
  isMaxZoom: boolean;
  position?: {
    z: string | null;
    lat: string | null; 
    lng: string | null;
  } | null;
}

export const LeftPanel = memo(function LeftPanel({ isMaxZoom, position }: LeftPanelProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Map Controls
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* Position Info */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide">Position</h3>
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="text-sm text-gray-700 font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Current Location
            </div>
            {position?.z ? (
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Zoom:</span>
                  <span className="font-mono text-gray-900">{position.z}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Latitude:</span>
                  <span className="font-mono text-gray-900">{position.lat}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Longitude:</span>
                  <span className="font-mono text-gray-900">{position.lng}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500">Position loading...</div>
            )}
          </div>
        </div>

        {/* Map Status */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide">Status</h3>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${isMaxZoom ? 'bg-green-500' : 'bg-amber-500'}`} />
              <span className="text-gray-700">
                {isMaxZoom ? 'Ready for tile interaction' : 'Zoom to max level for tiles'}
              </span>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {isMaxZoom 
                ? 'Hover over tiles to highlight, click to open menu' 
                : 'Use scroll wheel or zoom controls to reach maximum zoom'}
            </div>
          </div>
        </div>

        {/* Generation Info */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide">Generation</h3>
          <div className="bg-blue-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-blue-900">
              <Palette className="h-4 w-4" />
              <span className="font-medium">Nano Banana Model</span>
            </div>
            <div className="text-xs text-blue-700">
              AI-powered tile generation with neighbor awareness for seamless edges.
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide">Tips</h3>
          <div className="space-y-2 text-xs text-gray-600">
            <div className="bg-gray-50 rounded p-2">
              <strong>3×3 Preview:</strong> See full context before applying changes
            </div>
            <div className="bg-gray-50 rounded p-2">
              <strong>Selective Apply:</strong> Choose which tiles to keep from preview
            </div>
            <div className="bg-gray-50 rounded p-2">
              <strong>Blending Modes:</strong> Toggle between raw and edge-blended results
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

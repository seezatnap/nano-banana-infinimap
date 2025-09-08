"use client";

import { memo } from "react";
import { Settings, Map, Info, Palette } from "lucide-react";
import { CanvasMenu } from "../map/canvas-menu";

interface TopMenuProps {
  onCanvasReset?: () => void;
}

export const TopMenu = memo(function TopMenu({ onCanvasReset }: TopMenuProps) {
  return (
    <div className="h-14 px-4 flex items-center justify-between bg-white border-b border-gray-200">
      {/* Left Side - Logo/Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Map className="h-6 w-6 text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-900">Infinimap</h1>
        </div>
        <div className="text-xs text-gray-500 bg-blue-50 px-2 py-1 rounded-full">
          AI-Powered Infinite Map Generator
        </div>
      </div>

      {/* Center - Map Info */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <Palette className="h-4 w-4" />
          <span>Nano Banana Model</span>
        </div>
      </div>

      {/* Right Side - Actions */}
      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          title="About"
        >
          <Info className="h-4 w-4" />
          <span className="hidden sm:inline">About</span>
        </button>
        
        {/* Canvas Menu Integration */}
        <div className="relative">
          <CanvasMenu onCanvasReset={onCanvasReset} />
        </div>
      </div>
    </div>
  );
});

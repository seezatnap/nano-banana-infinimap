"use client";

import { memo } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Settings } from "lucide-react";

interface PreviewControlsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  blendMode: boolean;
  onBlendModeChange: (blend: boolean) => void;
}

export const PreviewControls = memo(function PreviewControls({
  activeTab,
  onTabChange,
  blendMode,
  onBlendModeChange
}: PreviewControlsProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium">Image View</span>
      <div className="flex items-center gap-2">
        <Tabs.List className="rounded-xl text-xs border overflow-hidden">
          <Tabs.Trigger 
            value="original" 
            className="px-2 py-1 text-xs data-[state=active]:bg-gray-200 transition-colors"
          >
            Original
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="preview" 
            className="px-2 py-1 text-xs data-[state=active]:bg-gray-200 transition-colors"
          >
            Preview
          </Tabs.Trigger>
        </Tabs.List>
        
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="h-7 w-7 rounded-full border hover:bg-gray-50 inline-flex items-center justify-center transition-colors"
              aria-label="Preview Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content 
            align="end" 
            className="bg-white rounded-md shadow border p-1 text-sm z-[10002]"
          >
            <div className="px-2 py-1 text-[11px] text-gray-600">Preview Settings</div>
            <div className="my-1 h-px bg-gray-200" />
            <div className="px-1 py-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-1 hover:bg-gray-50 rounded px-1 transition-colors">
                <input
                  type="radio"
                  name="blendMode"
                  className="accent-blue-600"
                  checked={!blendMode}
                  onChange={() => onBlendModeChange(false)}
                />
                Raw
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-1 hover:bg-gray-50 rounded px-1 transition-colors">
                <input
                  type="radio"
                  name="blendMode"
                  className="accent-blue-600"
                  checked={blendMode}
                  onChange={() => onBlendModeChange(true)}
                />
                Blended
              </label>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  );
});

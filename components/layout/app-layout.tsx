"use client";

import { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
  topPanel?: ReactNode;
  leftPanel?: ReactNode;
  rightPanel?: ReactNode;
  bottomPanel?: ReactNode;
}

export function AppLayout({ 
  children, 
  topPanel, 
  leftPanel, 
  rightPanel, 
  bottomPanel 
}: AppLayoutProps) {
  return (
    <div className="w-screen h-screen bg-gray-100 flex flex-col overflow-hidden">
      {/* Top Panel */}
      {topPanel && (
        <div className="flex-none bg-white border-b border-gray-200 shadow-sm z-30">
          {topPanel}
        </div>
      )}
      
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        {leftPanel && (
          <div className="flex-none w-80 bg-white border-r border-gray-200 shadow-sm z-20 overflow-y-auto">
            {leftPanel}
          </div>
        )}
        
        {/* Center Map Area */}
        <div className="flex-1 relative bg-gray-50">
          <div className="absolute inset-4 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {children}
          </div>
        </div>
        
        {/* Right Panel */}
        {rightPanel && (
          <div className="flex-none w-80 bg-white border-l border-gray-200 shadow-sm z-20 overflow-y-auto">
            {rightPanel}
          </div>
        )}
      </div>
      
      {/* Bottom Panel */}
      {bottomPanel && (
        <div className="flex-none bg-white border-t border-gray-200 shadow-sm z-30">
          {bottomPanel}
        </div>
      )}
    </div>
  );
}

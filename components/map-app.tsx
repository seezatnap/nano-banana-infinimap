"use client";

import { useState } from "react";
import { AppLayout } from "./layout/app-layout";
import { TopMenu } from "./layout/top-menu";
import { LeftPanel } from "./layout/left-panel";
import MapClientWindowed from "./map-client/map-client-windowed";

interface MapState {
  isMaxZoom: boolean;
  position: {
    z: string | null;
    lat: string | null;
    lng: string | null;
  };
  tileExists: Record<string, boolean>;
}

export default function MapApp() {
  const [mapState, setMapState] = useState<MapState>({
    isMaxZoom: false,
    position: { z: null, lat: null, lng: null },
    tileExists: {}
  });

  const handleCanvasReset = async () => {
    // This will be passed down to the windowed map client
    setMapState(prev => ({
      ...prev,
      tileExists: {}
    }));
  };

  return (
    <AppLayout
      topPanel={<TopMenu onCanvasReset={handleCanvasReset} />}
      leftPanel={
        <LeftPanel 
          isMaxZoom={mapState.isMaxZoom}
          position={mapState.position}
        />
      }
    >
      <MapClientWindowed 
        onStateChange={setMapState}
      />
    </AppLayout>
  );
}

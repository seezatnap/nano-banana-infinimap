"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams as useSearchParamsHook } from "next/navigation";
import dynamic from "next/dynamic";

const TileControls = dynamic(() => import("./TileControls"), { ssr: false });

const MAX_Z = Number(process.env.NEXT_PUBLIC_ZMAX ?? 8);

export default function MapClient() {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number; screenX: number; screenY: number } | null>(null);
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number; screenX: number; screenY: number } | null>(null);
  const selectedTileRef = useRef<typeof selectedTile>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const suppressOpenUntil = useRef<number>(0);
  const [tileExists, setTileExists] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const searchParams = useSearchParamsHook();
  const updateTimeoutRef = useRef<any>(undefined);

  useEffect(() => {
    selectedTileRef.current = selectedTile;
  }, [selectedTile]);

  // Close menu when clicking anywhere outside of it
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!selectedTileRef.current) return;
      // Ignore clicks inside any open modal dialog content
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-dialog-root]')) return;
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setSelectedTile(null);
      selectedTileRef.current = null;
      // Prevent the same click from immediately re-opening via map click
      suppressOpenUntil.current = performance.now() + 250;
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  // Update URL with debouncing
  const updateURL = useCallback((m: any) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    updateTimeoutRef.current = window.setTimeout(() => {
      const center = m.getCenter();
      const zoom = m.getZoom();
      const params = new URLSearchParams();
      params.set('z', zoom.toString());
      params.set('lat', center.lat.toFixed(6));
      params.set('lng', center.lng.toFixed(6));
      
      // Update URL without triggering navigation
      const newURL = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', newURL);
    }, 300); // Debounce for 300ms
  }, []);

  // Check if a tile exists
  const checkTileExists = useCallback(async (x: number, y: number) => {
    try {
      const response = await fetch(`/api/meta/${MAX_Z}/${x}/${y}`);
      const data = await response.json();
      const exists = data.status === "READY";
      setTileExists(prev => ({ ...prev, [`${x},${y}`]: exists }));
      return exists;
    } catch {
      return false;
    }
  }, []);

  // Handle tile generation
  const handleGenerate = useCallback(async (x: number, y: number, prompt: string) => {
    try {
      const response = await fetch(`/api/claim/${MAX_Z}/${x}/${y}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      
      if (response.ok) {
        // Start polling for completion
        if (map) {
          import('leaflet').then((L) => {
            pollTileStatus(x, y, map, L);
          });
        }
        setTileExists(prev => ({ ...prev, [`${x},${y}`]: true }));
      }
    } catch (error) {
      console.error("Failed to generate tile:", error);
      throw error;
    }
  }, [map]);

  // Handle tile regeneration
  const handleRegenerate = useCallback(async (x: number, y: number, prompt: string) => {
    try {
      const response = await fetch(`/api/invalidate/${MAX_Z}/${x}/${y}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      
      if (response.ok) {
        // Start polling for completion
        if (map) {
          import('leaflet').then((L) => {
            pollTileStatus(x, y, map, L);
          });
        }
      }
    } catch (error) {
      console.error("Failed to regenerate tile:", error);
      throw error;
    }
  }, [map]);

  // Handle tile deletion
  const handleDelete = useCallback(async (x: number, y: number) => {
    try {
      const response = await fetch(`/api/delete/${MAX_Z}/${x}/${y}`, {
        method: "DELETE"
      });
      
      if (response.ok) {
        // Force refresh tiles with a cache-busting URL so the deleted
        // tile is immediately replaced by the default image.
        const tileLayer = (map as any)?._tileLayer;
        if (tileLayer?.setUrl) {
          tileLayer.setUrl(`/api/tiles/{z}/{x}/{y}?v=${Date.now()}`);
        } else if (tileLayer) {
          // Fallback: remove/re-add the layer with a new timestamped template
          const L = await import('leaflet');
          (map as any).removeLayer(tileLayer);
          const newTileLayer = L.tileLayer(`/api/tiles/{z}/{x}/{y}?v=${Date.now()}`, { 
            tileSize: 256, 
            minZoom: 0, 
            maxZoom: MAX_Z, 
            noWrap: true,
            updateWhenIdle: false,
            updateWhenZooming: false,
            keepBuffer: 0
          });
          newTileLayer.addTo(map as any);
          (map as any)._tileLayer = newTileLayer;
        }
        setTileExists(prev => ({ ...prev, [`${x},${y}`]: false }));
      }
    } catch (error) {
      console.error("Failed to delete tile:", error);
      throw error;
    }
  }, [map]);

  useEffect(() => {
    if (!ref.current || map) return;
    
    // Dynamic import for Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      // Parse initial position from URL
      const initialZoom = searchParams?.get('z') ? parseInt(searchParams.get('z')!) : 2;
      const initialLat = searchParams?.get('lat') ? parseFloat(searchParams.get('lat')!) : null;
      const initialLng = searchParams?.get('lng') ? parseFloat(searchParams.get('lng')!) : null;
      
      const m = L.map(ref.current!, { 
        crs: L.CRS.Simple, 
        minZoom: 0, 
        maxZoom: MAX_Z,
        zoom: initialZoom
      });
      
      const world = (1 << MAX_Z) * 256;
      const sw = m.unproject([0, world] as any, MAX_Z);
      const ne = m.unproject([world, 0] as any, MAX_Z);
      const bounds = new L.LatLngBounds(sw, ne);
      m.setMaxBounds(bounds);
      
      // Set initial view
      if (initialLat !== null && initialLng !== null) {
        m.setView([initialLat, initialLng], initialZoom);
      } else {
        m.fitBounds(bounds);
      }

      // Add timestamp to force fresh tiles on page load
      const tileLayer = L.tileLayer(`/api/tiles/{z}/{x}/{y}?v=${Date.now()}`, { 
        tileSize: 256, 
        minZoom: 0, 
        maxZoom: MAX_Z, 
        noWrap: true,
        updateWhenIdle: false,
        updateWhenZooming: false,
        keepBuffer: 0
      });
      tileLayer.addTo(m);
      
      // Store reference for refresh
      (m as any)._tileLayer = tileLayer;

      // Update URL when map moves
      m.on('moveend', () => updateURL(m));
      m.on('zoomend', () => updateURL(m));

      // Keep selected tile menu positioned correctly while moving/zooming
      const updateSelectedPosition = () => {
        const current = selectedTileRef.current;
        if (!current) return;
        const tileCenterWorld = L.point((current.x + 0.5) * 256, (current.y + 0.5) * 256);
        const tileCenterLatLng = m.unproject(tileCenterWorld, m.getZoom());
        const tileCenterScreen = m.latLngToContainerPoint(tileCenterLatLng);
        setSelectedTile(prev => prev ? ({ ...prev, screenX: tileCenterScreen.x, screenY: tileCenterScreen.y }) : prev);
      };
      m.on('move', updateSelectedPosition);
      m.on('zoomend', updateSelectedPosition);

      // Track mouse hover over tiles
      m.on("mousemove", async (e: any) => {
        if (m.getZoom() !== m.getMaxZoom()) {
          setHoveredTile(null);
          // Reset cursor when not interactive
          m.getContainer().style.cursor = '';
          return;
        }
        
        const p = m.project(e.latlng, m.getZoom());
        const x = Math.floor(p.x / 256);
        const y = Math.floor(p.y / 256);
        
        // Update hovered tile if changed
        if (!hoveredTile || hoveredTile.x !== x || hoveredTile.y !== y) {
          // Calculate the center of the tile
          const tileCenterWorld = L.point((x + 0.5) * 256, (y + 0.5) * 256);
          const tileCenterLatLng = m.unproject(tileCenterWorld, m.getZoom());
          const tileCenterScreen = m.latLngToContainerPoint(tileCenterLatLng);
          
          setHoveredTile({ 
            x, 
            y, 
            screenX: tileCenterScreen.x,
            screenY: tileCenterScreen.y
          });

          // Indicate clickable area via cursor
          m.getContainer().style.cursor = 'pointer';
          
          // Check if tile exists
          const key = `${x},${y}`;
          if (!(key in tileExists)) {
            checkTileExists(x, y);
          }
        }
      });

      m.on("mouseleave", () => {
        setHoveredTile(null);
        // Reset cursor when leaving the map
        m.getContainer().style.cursor = '';
      });

      m.on("zoomstart", () => {
        setHoveredTile(null);
        setSelectedTile(null);
      });

      // Open menu on click at max zoom without breaking drag
      m.on('click', (e: any) => {
        if (m.getZoom() !== m.getMaxZoom()) {
          return;
        }
        // If a menu is already open, close it instead of opening another
        if (selectedTileRef.current) {
          setSelectedTile(null);
          selectedTileRef.current = null;
          // Also update hover tile to current click position so the highlight can show
          const pNow = m.project(e.latlng, m.getZoom());
          const hx = Math.floor(pNow.x / 256);
          const hy = Math.floor(pNow.y / 256);
          const centerWorld = L.point((hx + 0.5) * 256, (hy + 0.5) * 256);
          const centerLatLng = m.unproject(centerWorld, m.getZoom());
          const centerScreen = m.latLngToContainerPoint(centerLatLng);
          setHoveredTile({ x: hx, y: hy, screenX: centerScreen.x, screenY: centerScreen.y });
          return;
        }
        // Respect suppression window set by outside clicks
        if (performance.now() < suppressOpenUntil.current) {
          return;
        }
        const p = m.project(e.latlng, m.getZoom());
        const x = Math.floor(p.x / 256);
        const y = Math.floor(p.y / 256);
        const tileCenterWorld = L.point((x + 0.5) * 256, (y + 0.5) * 256);
        const tileCenterLatLng = m.unproject(tileCenterWorld, m.getZoom());
        const tileCenterScreen = m.latLngToContainerPoint(tileCenterLatLng);
        setSelectedTile({ x, y, screenX: tileCenterScreen.x, screenY: tileCenterScreen.y });

        const key = `${x},${y}`;
        if (!(key in tileExists)) {
          checkTileExists(x, y);
        }
      });

      setMap(m);
      
      // Set initial URL if not already set
      if (!searchParams.get('z')) {
        updateURL(m);
      }
    });
  }, [map, searchParams, updateURL, hoveredTile, tileExists, checkTileExists]);

  // Poll for tile generation completion
  const pollTileStatus = async (x: number, y: number, m: any, L: any) => {
    let attempts = 0;
    const maxAttempts = 30; // Poll for up to 30 seconds
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/meta/${MAX_Z}/${x}/${y}`);
        const data = await response.json();
        
        if (data.status === "READY") {
          console.log(`Tile ready at ${MAX_Z}/${x}/${y}, refreshing...`);
          
          // Get the tile layer
          const tileLayer = (m as any)._tileLayer;
          if (tileLayer) {
            // Debug: log all tile keys to find the right format
            if (tileLayer._tiles) {
              console.log('Current tile keys:', Object.keys(tileLayer._tiles));
            }
            
            // Try different key formats
            const keys = [
              `${x}:${y}:${MAX_Z}`,
              `${MAX_Z}:${x}:${y}`,
              `${x}_${y}_${MAX_Z}`,
              `${MAX_Z}_${x}_${y}`
            ];
            
            let tileFound = false;
            for (const key of keys) {
              if (tileLayer._tiles && tileLayer._tiles[key]) {
                const tileEl = tileLayer._tiles[key].el;
                if (tileEl && tileEl.src) {
                  // Force reload with cache buster
                  tileEl.src = `/api/tiles/${MAX_Z}/${x}/${y}?t=${Date.now()}`;
                  console.log(`Updated tile src with key ${key}: ${tileEl.src}`);
                  tileFound = true;
                  break;
                }
              }
            }
            
            if (!tileFound) {
              console.log(`Tile not found in DOM, forcing full redraw`);
              // Remove and re-add the layer with new timestamp
              m.removeLayer(tileLayer);
              const newTileLayer = L.tileLayer(`/api/tiles/{z}/{x}/{y}?v=${Date.now()}`, { 
                tileSize: 256, 
                minZoom: 0, 
                maxZoom: MAX_Z, 
                noWrap: true,
                updateWhenIdle: false,
                updateWhenZooming: false,
                keepBuffer: 0
              });
              newTileLayer.addTo(m);
              (m as any)._tileLayer = newTileLayer;
            }
          }
        } else if (data.status === "PENDING" && attempts < maxAttempts) {
          attempts++;
          setTimeout(checkStatus, 1000); // Check again in 1 second
        }
      } catch (error) {
        console.error("Error checking tile status:", error);
      }
    };
    
    setTimeout(checkStatus, 1000); // Start checking after 1 second
  };

  return (
    <div className="w-full h-full relative">
      <div className="p-3 z-10 absolute top-2 left-2 bg-white/90 rounded-xl shadow-lg flex flex-col gap-2">
        <div className="text-sm text-gray-600">
          {map && map.getZoom() === MAX_Z ? 
            "Hover to highlight, click to open menu" : 
            "Zoom to max level to interact with tiles"}
        </div>
        {searchParams.get('z') && (
          <div className="text-xs text-gray-400">
            Position: z={searchParams.get('z')}, lat={searchParams.get('lat')}, lng={searchParams.get('lng')}
          </div>
        )}
      </div>
      
      {/* Hover highlight at max zoom (visual only, non-interactive) */}
      {hoveredTile && !selectedTile && map && map.getZoom() === MAX_Z && (
        <div
          className="absolute"
          style={{
            left: hoveredTile.screenX - 128,
            top: hoveredTile.screenY - 128,
            width: 256,
            height: 256,
            background: 'rgba(255,255,255,0.1)',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        />
      )}

      {/* Tile menu shown on click */}
      {selectedTile && map && map.getZoom() === MAX_Z && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: selectedTile.screenX,
            top: selectedTile.screenY,
            transform: 'translate(-50%, -50%)',
            zIndex: 500,
          }}
        >
          <div
            ref={menuRef}
            className="pointer-events-auto bg-white rounded-lg shadow-xl p-2 border border-gray-200"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs text-gray-500 mb-1">
              Tile ({selectedTile.x}, {selectedTile.y})
            </div>
            <TileControls
              x={selectedTile.x}
              y={selectedTile.y}
              z={MAX_Z}
              exists={tileExists[`${selectedTile.x},${selectedTile.y}`] || false}
              onGenerate={(prompt) => handleGenerate(selectedTile.x, selectedTile.y, prompt)}
              onRegenerate={(prompt) => handleRegenerate(selectedTile.x, selectedTile.y, prompt)}
              onDelete={() => handleDelete(selectedTile.x, selectedTile.y)}
            />
          </div>
        </div>
      )}
      
      <div ref={ref} className="w-full h-full" />
    </div>
  );
}

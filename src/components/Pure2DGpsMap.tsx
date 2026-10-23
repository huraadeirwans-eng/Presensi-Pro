import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MapPin,
  Crosshair,
  Plus,
  Minus,
  RotateCcw,
  ExternalLink,
  Layers,
  Building2,
  CheckCircle2,
  Compass,
} from 'lucide-react';

interface Pure2DGpsMapProps {
  latitude: number;
  longitude: number;
  accuracy?: number;
  hospitalLocation?: {
    name?: string;
    latitude: number;
    longitude: number;
    radiusMeters?: number;
  };
  distanceMeters?: number;
  isInRadius?: boolean;
  className?: string;
  height?: string | number;
  mapsUrl?: string;
  osmUrl?: string;
  title?: string;
}

type MapLayerType = 'voyager' | 'osm' | 'dark' | 'satellite';

const TILE_SERVERS: Record<MapLayerType, { name: string; url: (z: number, x: number, y: number) => string }> = {
  voyager: {
    name: 'Peta Jalan (Cerah)',
    url: (z, x, y) => {
      const s = ['a', 'b', 'c', 'd'][(x + y) % 4];
      return `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
    },
  },
  satellite: {
    name: 'Foto Satelit (Udara)',
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
  osm: {
    name: 'OpenStreetMap',
    url: (z, x, y) => {
      const s = ['a', 'b', 'c'][(x + y) % 3];
      return `https://${s}.tile.openstreetmap.fr/hot/${z}/${x}/${y}.png`;
    },
  },
  dark: {
    name: 'Mode Gelap (Malam)',
    url: (z, x, y) => {
      const s = ['a', 'b', 'c', 'd'][(x + y) % 4];
      return `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
    },
  },
};

/**
 * Web Mercator EPSG:3857 projection
 */
function projectToWorldPixels(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const siny = Math.sin((lat * Math.PI) / 180);
  const clampedSiny = Math.min(Math.max(siny, -0.9999), 0.9999);
  const scale = 256 * Math.pow(2, zoom);
  const x = scale * (0.5 + lon / 360);
  const y = scale * (0.5 - Math.log((1 + clampedSiny) / (1 - clampedSiny)) / (4 * Math.PI));
  return { x, y };
}

/**
 * Meters per pixel at a given latitude and zoom level
 */
function getMetersPerPixel(lat: number, zoom: number): number {
  return (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6378137) / (256 * Math.pow(2, zoom));
}

export const Pure2DGpsMap: React.FC<Pure2DGpsMapProps> = ({
  latitude,
  longitude,
  accuracy = 10,
  hospitalLocation,
  distanceMeters,
  isInRadius = true,
  className = '',
  height = '100%',
  mapsUrl,
  osmUrl,
  title = 'Peta Lokasi GPS Presensi',
}) => {
  // Koordinat aman dengan fallback acuan RS jika GPS belum terkunci
  const safeLat = typeof latitude === 'number' && !isNaN(latitude) && latitude !== 0 ? latitude : (hospitalLocation?.latitude || -2.942275);
  const safeLng = typeof longitude === 'number' && !isNaN(longitude) && longitude !== 0 ? longitude : (hospitalLocation?.longitude || 104.784318);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 320 });
  const [zoom, setZoom] = useState<number>(17);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: safeLat, lng: safeLng });
  const [activeLayer, setActiveLayer] = useState<MapLayerType>('voyager');
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);

  // Pan / Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Update center when input lat/lng changes
  useEffect(() => {
    setMapCenter({ lat: safeLat, lng: safeLng });
    setDragOffset({ x: 0, y: 0 });
  }, [safeLat, safeLng]);

  // Monitor container size
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight });
        }
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Center coordinates in world pixel space
  const centerWorld = useMemo(() => {
    return projectToWorldPixels(mapCenter.lat, mapCenter.lng, zoom);
  }, [mapCenter.lat, mapCenter.lng, zoom]);

  // Viewport center applied with drag offset
  const viewportCenterPixel = useMemo(() => {
    return {
      x: centerWorld.x - dragOffset.x,
      y: centerWorld.y - dragOffset.y,
    };
  }, [centerWorld, dragOffset]);

  // Top-left corner of visible viewport in world pixels
  const viewportTopLeft = useMemo(() => {
    return {
      x: viewportCenterPixel.x - dimensions.width / 2,
      y: viewportCenterPixel.y - dimensions.height / 2,
    };
  }, [viewportCenterPixel, dimensions]);

  // Compute required raster tiles covering the visible viewport
  const visibleTiles = useMemo(() => {
    const tileStartX = Math.floor(viewportTopLeft.x / 256);
    const tileEndX = Math.floor((viewportTopLeft.x + dimensions.width) / 256);
    const tileStartY = Math.floor(viewportTopLeft.y / 256);
    const tileEndY = Math.floor((viewportTopLeft.y + dimensions.height) / 256);

    const maxTile = Math.pow(2, zoom);
    const tiles: Array<{
      key: string;
      url: string;
      z: number;
      x: number;
      y: number;
      left: number;
      top: number;
    }> = [];

    for (let tx = tileStartX; tx <= tileEndX; tx++) {
      for (let ty = tileStartY; ty <= tileEndY; ty++) {
        // Wrap tileX horizontally across world boundary
        const wrappedX = ((tx % maxTile) + maxTile) % maxTile;
        if (ty >= 0 && ty < maxTile) {
          const left = tx * 256 - viewportTopLeft.x;
          const top = ty * 256 - viewportTopLeft.y;
          tiles.push({
            key: `${activeLayer}-${zoom}-${tx}-${ty}`,
            url: TILE_SERVERS[activeLayer].url(zoom, wrappedX, ty),
            z: zoom,
            x: wrappedX,
            y: ty,
            left,
            top,
          });
        }
      }
    }
    return tiles;
  }, [viewportTopLeft, dimensions, zoom, activeLayer]);

  // Coordinates to pixel position relative to current viewport
  const latLngToScreen = useCallback(
    (lat: number, lng: number) => {
      const p = projectToWorldPixels(lat, lng, zoom);
      return {
        x: p.x - viewportTopLeft.x,
        y: p.y - viewportTopLeft.y,
      };
    },
    [zoom, viewportTopLeft]
  );

  // User position on screen
  const userScreenPos = useMemo(() => {
    return latLngToScreen(latitude, longitude);
  }, [latLngToScreen, latitude, longitude]);

  // Hospital position on screen (if available)
  const hospitalScreenPos = useMemo(() => {
    if (!hospitalLocation) return null;
    return latLngToScreen(hospitalLocation.latitude, hospitalLocation.longitude);
  }, [latLngToScreen, hospitalLocation]);

  // Ground resolution & pixel radii
  const metersPerPixel = useMemo(() => {
    return getMetersPerPixel(latitude, zoom);
  }, [latitude, zoom]);

  const accuracyRadiusPx = useMemo(() => {
    return Math.max(8, Math.min(accuracy / metersPerPixel, 350));
  }, [accuracy, metersPerPixel]);

  const hospitalRadiusPx = useMemo(() => {
    if (!hospitalLocation?.radiusMeters) return 0;
    return Math.max(12, Math.min(hospitalLocation.radiusMeters / metersPerPixel, 450));
  }, [hospitalLocation?.radiusMeters, metersPerPixel]);

  // Drag handlers for mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setDragOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Drag handlers for touch on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStart.x;
    const dy = e.touches[0].clientY - dragStart.y;
    setDragOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 1, 19));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 1, 14));

  const handleRecenterUser = () => {
    setMapCenter({ lat: latitude, lng: longitude });
    setDragOffset({ x: 0, y: 0 });
  };

  const handleRecenterHospital = () => {
    if (hospitalLocation) {
      setMapCenter({ lat: hospitalLocation.latitude, lng: hospitalLocation.longitude });
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const effectiveMapsUrl = mapsUrl || `https://www.google.com/maps?q=${latitude},${longitude}`;
  const effectiveOsmUrl = osmUrl || `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`;

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-xl overflow-hidden select-none bg-slate-950 border border-slate-800 shadow-inner ${className}`}
      style={{ height, minHeight: '220px', cursor: isDragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label={title}
    >
      {/* 1. Pure 2D Raster Tile Grid (100% Bebas WebGL, Menggunakan Tile Gambar Standar 256x256) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {visibleTiles.map((t) => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            style={{
              position: 'absolute',
              left: `${t.left}px`,
              top: `${t.top}px`,
              width: '256px',
              height: '256px',
              userSelect: 'none',
              pointerEvents: 'none',
              filter: activeLayer === 'dark' ? 'none' : 'contrast(102%) brightness(98%)',
            }}
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.dataset.fallbackApplied) {
                target.dataset.fallbackApplied = 'true';
                const sub = ['a', 'b', 'c', 'd'][(t.x + t.y) % 4];
                target.src = `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${t.z}/${t.x}/${t.y}.png`;
              } else {
                target.style.backgroundColor = '#0f172a';
              }
            }}
          />
        ))}
      </div>

      {/* 2. SVG Vector Overlays: Geofence Circle, Accuracy Halo, Distance Connector & Markers */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10 }}
      >
        <defs>
          {/* Radial Gradient for User Accuracy Halo */}
          <radialGradient id="accuracyGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
            <stop offset="70%" stopColor="#06b6d4" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
          </radialGradient>

          {/* Radial Gradient for Hospital Geofence Zone */}
          <radialGradient id="geofenceGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={isInRadius ? '#10b981' : '#f43f5e'} stopOpacity="0.28" />
            <stop offset="85%" stopColor={isInRadius ? '#10b981' : '#f43f5e'} stopOpacity="0.12" />
            <stop offset="100%" stopColor={isInRadius ? '#10b981' : '#f43f5e'} stopOpacity="0.02" />
          </radialGradient>
        </defs>

        {/* A. Lingkaran Geofence Acuan Rumah Sakit (100m) */}
        {hospitalScreenPos && hospitalRadiusPx > 0 && (
          <g>
            <circle
              cx={hospitalScreenPos.x}
              cy={hospitalScreenPos.y}
              r={hospitalRadiusPx}
              fill="url(#geofenceGradient)"
              stroke={isInRadius ? '#10b981' : '#f43f5e'}
              strokeWidth="2"
              strokeDasharray="6 4"
            />
          </g>
        )}

        {/* B. Garis Penghubung Jarak Posisi Anda ke Titik Acuan RS */}
        {hospitalScreenPos && (
          <g>
            <line
              x1={userScreenPos.x}
              y1={userScreenPos.y}
              x2={hospitalScreenPos.x}
              y2={hospitalScreenPos.y}
              stroke="#38bdf8"
              strokeWidth="2"
              strokeDasharray="4 4"
              opacity="0.85"
            />
          </g>
        )}

        {/* C. Lingkaran Akurasi Sensor GPS Anda (± accuracy meter) */}
        <circle
          cx={userScreenPos.x}
          cy={userScreenPos.y}
          r={accuracyRadiusPx}
          fill="url(#accuracyGradient)"
          stroke="#06b6d4"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      </svg>

      {/* 3. HTML Markers (Clean DOM elements for interactive crisp badges) */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 15 }}>
        {/* Hospital Landmark Marker */}
        {hospitalScreenPos && (
          <div
            className="absolute transform -translate-x-1/2 -translate-y-full transition-transform"
            style={{ left: `${hospitalScreenPos.x}px`, top: `${hospitalScreenPos.y}px` }}
          >
            <div className="flex flex-col items-center">
              <div className="px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 text-[10px] font-bold shadow-lg flex items-center gap-1 whitespace-nowrap mb-1">
                <Building2 className="w-3 h-3 text-emerald-400" />
                <span>{hospitalLocation?.name?.split('-')[0]?.trim() || 'Titik Acuan RS'}</span>
              </div>
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black shadow-lg border-2 border-white">
                <Building2 className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          </div>
        )}

        {/* Distance Badge on Connector Midpoint */}
        {hospitalScreenPos && distanceMeters !== undefined && (
          <div
            className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: `${(userScreenPos.x + hospitalScreenPos.x) / 2}px`,
              top: `${(userScreenPos.y + hospitalScreenPos.y) / 2}px`,
            }}
          >
            <span className="px-2 py-0.5 rounded-full bg-slate-950/90 border border-teal-500/50 text-teal-300 font-mono font-bold text-[10px] shadow-md whitespace-nowrap">
              {distanceMeters} meter
            </span>
          </div>
        )}

        {/* User GPS Position Pulse Marker */}
        <div
          className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-transform"
          style={{ left: `${userScreenPos.x}px`, top: `${userScreenPos.y}px` }}
        >
          <div className="relative flex items-center justify-center">
            {/* Outer animated radar ping */}
            <span className="absolute w-8 h-8 rounded-full bg-blue-500/40 animate-ping" />
            {/* Middle ring */}
            <span className="absolute w-5 h-5 rounded-full bg-blue-400/50" />
            {/* Center solid core dot */}
            <span className="relative w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow-md" />
          </div>
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 mt-1 whitespace-nowrap">
            <span className="px-2 py-0.5 rounded-md bg-slate-950/90 border border-blue-500/60 text-blue-200 text-[10px] font-bold shadow-md">
              Posisi Anda (WGS84)
            </span>
          </div>
        </div>
      </div>

      {/* 4. Top-Left Status Overlay Badges */}
      <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 z-20 pointer-events-none max-w-[85%]">
        <div className="px-2.5 py-1 rounded-lg bg-slate-950/90 backdrop-blur-md border border-slate-700 text-[11px] font-semibold text-white shadow-md flex items-center gap-1.5 w-fit">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse border border-white shrink-0" />
          <span className="truncate">Marker Biru: Posisi GPS Anda (WGS84)</span>
        </div>

        <div className="px-2.5 py-1 rounded-lg bg-slate-950/90 backdrop-blur-md border border-slate-700 text-[10px] text-teal-300 font-mono shadow-md flex items-center gap-1.5 w-fit">
          <Crosshair className="w-3 h-3 text-teal-400 shrink-0" />
          <span>Akurasi Sensor: ±{Math.round(accuracy)} meter</span>
        </div>

        {hospitalLocation && (
          <div className="px-2.5 py-0.5 rounded-lg bg-slate-950/85 backdrop-blur-md border border-slate-700 text-[10px] text-emerald-300 font-semibold shadow-md flex items-center gap-1.5 w-fit">
            <span className="w-2 h-2 rounded-full bg-emerald-400 border border-white shrink-0" />
            <span className="truncate">Lingkaran Hijau: Radius RS ({hospitalLocation.radiusMeters || 100}m)</span>
          </div>
        )}
      </div>

      {/* 5. Top-Right Navigation Controls (Zoom & Recenter) */}
      <div className="absolute top-2.5 right-2.5 flex flex-col gap-1.5 z-20">
        {/* Layer Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsLayerMenuOpen(!isLayerMenuOpen);
            }}
            className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 backdrop-blur-md flex items-center justify-center shadow-md transition-colors cursor-pointer"
            title="Ganti Tema Peta"
          >
            <Layers className="w-4 h-4 text-teal-400" />
          </button>

          {isLayerMenuOpen && (
            <div className="absolute right-0 top-9 w-44 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1 z-30 text-xs text-slate-200 animate-in fade-in">
              <span className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Pilih Tampilan Peta:
              </span>
              {(Object.keys(TILE_SERVERS) as MapLayerType[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveLayer(key);
                    setIsLayerMenuOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeLayer === key
                      ? 'bg-teal-500 text-slate-950 font-bold'
                      : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <span>{TILE_SERVERS[key].name}</span>
                  {activeLayer === key && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Zoom In */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleZoomIn();
          }}
          disabled={zoom >= 19}
          className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-slate-700 backdrop-blur-md flex items-center justify-center shadow-md transition-colors cursor-pointer"
          title="Perbesar Peta (+)"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Zoom Out */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleZoomOut();
          }}
          disabled={zoom <= 14}
          className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-slate-700 backdrop-blur-md flex items-center justify-center shadow-md transition-colors cursor-pointer"
          title="Perkecil Peta (-)"
        >
          <Minus className="w-4 h-4" />
        </button>

        {/* Recenter to User GPS */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleRecenterUser();
          }}
          className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-teal-300 border border-slate-700 backdrop-blur-md flex items-center justify-center shadow-md transition-colors cursor-pointer"
          title="Pusatkan Kembali ke Posisi Saya"
        >
          <Crosshair className="w-4 h-4 text-teal-400" />
        </button>
      </div>

      {/* 6. Bottom-Right External Maps Links & Attribution */}
      <div className="absolute bottom-2.5 right-2.5 z-20 flex items-center gap-1.5">
        <a
          href={effectiveMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-teal-300 text-[11px] font-bold border border-slate-700 backdrop-blur-md shadow-md flex items-center gap-1 transition-colors"
          title="Buka titik koordinat di Google Maps"
        >
          <span>Google Maps</span>
          <ExternalLink className="w-3 h-3" />
        </a>

        <a
          href={effectiveOsmUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 text-[11px] font-bold border border-slate-700 backdrop-blur-md shadow-md flex items-center gap-1 transition-colors"
          title="Buka titik koordinat di OpenStreetMap"
        >
          <span>OpenStreetMap</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* 7. Bottom-Left Scale / Coordinates Indicator */}
      <div className="absolute bottom-2.5 left-2.5 z-20 pointer-events-none hidden sm:flex items-center gap-2">
        <div className="px-2 py-0.5 rounded bg-slate-950/80 backdrop-blur-sm border border-slate-800 text-[9px] font-mono text-slate-400">
          Zoom: {zoom}x | 100% 2D Raster (Bebas WebGL)
        </div>
      </div>
    </div>
  );
};

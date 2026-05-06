import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Supercluster from "supercluster";
import type { Listing } from "../types";

// ── Map styles ──────────────────────────────���──────────────��──────────────────

const SAT_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© Esri",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#111" } },
    { id: "sat", type: "raster", source: "sat" },
  ],
};

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    dark: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#1a1a2e" } },
    { id: "dark-tiles", type: "raster", source: "dark", paint: { "raster-brightness-min": 0.12, "raster-contrast": -0.05 } },
  ],
};

const MAP_STYLES: Record<"light" | "dark" | "sat", string | maplibregl.StyleSpecification> = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark:  DARK_STYLE,
  sat:   SAT_STYLE,
};

// ── Constants ───────────────────────────────���───────────────────────────��─────

const ACCENT_HUE = 45;
const DRAFT_COLOR = `oklch(0.68 0.19 ${ACCENT_HUE})`;
const MAP_POS_KEY = "crashsite.mapPos";

// ── Position persistence ─────────────────────────────���────────────────────────

function getSavedPos(): { center: [number, number]; zoom: number } | null {
  try {
    const s = JSON.parse(localStorage.getItem(MAP_POS_KEY) ?? "null");
    if (s?.lat != null && s?.lng != null && s?.zoom != null)
      return { center: [s.lng, s.lat] as [number, number], zoom: s.zoom };
  } catch {}
  return null;
}

function savePos(map: maplibregl.Map) {
  try {
    const c = map.getCenter();
    localStorage.setItem(MAP_POS_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
  } catch {}
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// MapLibre WebGL can't parse OKLCH — convert via canvas to get a hex string.
function toHex(css: string): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return css;
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  } catch {
    return css;
  }
}

// ── Pin helpers ───────────────────────────────���──────────────────────────��────

export function pinColor(listing: Listing, isPrivate = false): string {
  if (isPrivate) return "oklch(0.72 0.18 290)";
  if (listing.type === "lost" && listing.status === "active") return `oklch(0.68 0.19 ${ACCENT_HUE})`;
  return "oklch(0.62 0.12 155)";
}

function makePinHtml(listing: Listing, selected: boolean, isPrivate = false): string {
  const color = pinColor(listing, isPrivate);
  const isLost = listing.type === "lost";
  const isResolved = listing.status === "resolved";
  let inner = "";
  if (!isResolved && isLost) {
    inner += `<circle r="16" fill="${color}" opacity="0.0"><animate attributeName="r" values="9;22;9" dur="2.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.4;0;0.4" dur="2.6s" repeatCount="indefinite"/></circle>`;
  }
  if (selected) {
    inner += `<circle r="20" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.5" stroke-dasharray="4 3"/>`;
  }
  inner += `<circle r="10" fill="white" stroke="${color}" stroke-width="2"/>`;
  inner += `<circle r="5" fill="${color}"/>`;
  if (isPrivate) {
    inner += `<rect x="-4" y="-20" width="8" height="5.5" rx="1" fill="${color}" opacity="0.9"/>`;
    inner += `<path d="M -2.5,-20 a 2.5,2.5 0 0,1 5,0" fill="none" stroke="${color}" stroke-width="1.8" opacity="0.9"/>`;
  }
  if (selected) {
    const label = escapeXml(listing.nickname.slice(0, 14));
    inner += `<text y="-25" text-anchor="middle" font-size="11" font-family="Geist Mono, ui-monospace, monospace" fill="oklch(0.22 0.01 260)" font-weight="600" stroke="white" stroke-width="3" paint-order="stroke">${label}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="-24 -24 48 48" style="overflow:visible">${inner}</svg>`;
}

// ── Geographic circle polygon ─────────────────────────────────────────────────

function geoCircle(lat: number, lng: number, radiusM: number, steps = 64): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const dlat = (radiusM * Math.cos(a)) / 111320;
    const dlng = (radiusM * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180));
    pts.push([lng + dlng, lat + dlat]);
  }
  return pts;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  listings: Listing[];
  selectedPoint: { latitude: number; longitude: number } | null;
  showSelectedPointMarker: boolean;
  selectedListing: Listing | null;
  mapMode: "light" | "dark" | "sat";
  areaMode: "point" | "circle" | "polygon";
  circleRadius: number;
  polygonDraftPoints: Array<{ lat: number; lng: number }>;
  polygonFinished: boolean;
  privateListingIds?: Set<string>;
  onMapClick?: (p: { latitude: number; longitude: number }) => void;
  onPolygonPoint?: (p: { lat: number; lng: number }) => void;
  onPolygonPointsChange?: (pts: Array<{ lat: number; lng: number }>) => void;
  onListingClick?: (l: Listing) => void;
  onListingHover?: (l: Listing) => void;
  onListingLeave?: () => void;
  onCursorMove?: (p: { lat: number; lng: number } | null) => void;
  onMapReady?: (map: maplibregl.Map) => void;
  onViewChange?: (zoom: number, bounds: maplibregl.LngLatBounds) => void;
}

const EMPTY_SET = new Set<string>();

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapView({
  listings,
  selectedPoint,
  showSelectedPointMarker,
  selectedListing,
  mapMode,
  areaMode,
  circleRadius,
  polygonDraftPoints,
  polygonFinished,
  privateListingIds = EMPTY_SET,
  onMapClick = () => {},
  onPolygonPoint = () => {},
  onPolygonPointsChange = () => {},
  onListingClick = () => {},
  onListingHover = () => {},
  onListingLeave = () => {},
  onCursorMove = () => {},
  onMapReady = () => {},
  onViewChange = () => {},
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);

  // Supercluster state
  const scRef           = useRef<Supercluster | null>(null);
  const listingMapRef   = useRef(new Map<string, Listing>());
  const markersRef      = useRef(new Map<string, maplibregl.Marker>());
  const selectedIdRef   = useRef<string | null>(null);
  const privateIdsRef   = useRef(privateListingIds);
  useEffect(() => { privateIdsRef.current = privateListingIds; }, [privateListingIds]);

  // Tracks which marker key is currently hovered so we can fire leave when it's removed
  const hoveredKeyRef = useRef<string | null>(null);

  // Stable callback refs to avoid stale closures in event handlers
  const onMapClickRef            = useRef(onMapClick);
  const onPolygonPointRef        = useRef(onPolygonPoint);
  const onPolygonPointsChangeRef = useRef(onPolygonPointsChange);
  const onListingClickRef        = useRef(onListingClick);
  const onListingHoverRef        = useRef(onListingHover);
  const onListingLeaveRef        = useRef(onListingLeave);
  const onCursorMoveRef          = useRef(onCursorMove);
  const onViewChangeRef          = useRef(onViewChange);
  const onMapReadyRef            = useRef(onMapReady);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onPolygonPointRef.current = onPolygonPoint; }, [onPolygonPoint]);
  useEffect(() => { onPolygonPointsChangeRef.current = onPolygonPointsChange; }, [onPolygonPointsChange]);
  useEffect(() => { onListingClickRef.current = onListingClick; }, [onListingClick]);
  useEffect(() => { onListingHoverRef.current = onListingHover; }, [onListingHover]);
  useEffect(() => { onListingLeaveRef.current = onListingLeave; }, [onListingLeave]);
  useEffect(() => { onCursorMoveRef.current = onCursorMove; }, [onCursorMove]);
  useEffect(() => { onViewChangeRef.current = onViewChange; }, [onViewChange]);
  useEffect(() => { onMapReadyRef.current = onMapReady; }, [onMapReady]);

  // Current areaMode / showSelectedPointMarker (read in map click handler)
  const areaModeRef              = useRef(areaMode);
  const showSelectedPointRef     = useRef(showSelectedPointMarker);
  useEffect(() => { areaModeRef.current = areaMode; }, [areaMode]);
  useEffect(() => { showSelectedPointRef.current = showSelectedPointMarker; }, [showSelectedPointMarker]);

  // Polygon vertex markers
  const vertexMarkersRef = useRef<maplibregl.Marker[]>([]);
  const vertexPtsRef     = useRef(polygonDraftPoints);
  useEffect(() => { vertexPtsRef.current = polygonDraftPoints; }, [polygonDraftPoints]);


  // Cached GeoJSON data — re-applied after each style switch to re-hydrate overlays
  const areaDataRef  = useRef({ type: "FeatureCollection" as const, features: [] as object[] });
  const draftDataRef = useRef({ type: "FeatureCollection" as const, features: [] as object[] });

  // ── Add GeoJSON overlay sources (called after each style load) ──────────────

  const addOverlaySources = useCallback((map: maplibregl.Map) => {
    for (const id of ["area", "draft"] as const) {
      const dataRef = id === "area" ? areaDataRef : draftDataRef;
      if (!map.getSource(id)) {
        map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getLayer(`${id}-fill`)) {
        map.addLayer({ id: `${id}-fill`, type: "fill", source: id,
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.08 } });
      }
      if (!map.getLayer(`${id}-line`)) {
        map.addLayer({ id: `${id}-line`, type: "line", source: id,
          paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-dasharray": [5, 5] } });
      }
      if (!map.getLayer(`${id}-center`)) {
        map.addLayer({ id: `${id}-center`, type: "circle", source: id,
          filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-color": ["get", "color"], "circle-radius": 5, "circle-stroke-color": "white", "circle-stroke-width": 2 } });
      }
      // Re-apply cached data after style switch (sources are re-created empty)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map.getSource(id) as maplibregl.GeoJSONSource).setData(dataRef.current as any);
    }
  }, []);

  // ── Cluster markers ───────────────────────────────────────────────────────���───

  const updateMarkers = useCallback(() => {
    const map = mapRef.current;
    const sc  = scRef.current;
    if (!map || !sc) return;

    const bounds = map.getBounds();
    const zoom   = Math.floor(map.getZoom());
    const clusters = sc.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      zoom,
    );

    const nextIds = new Set<string>();

    for (const c of clusters) {
      const isCluster = c.properties.cluster === true;
      const key = isCluster ? `c${c.id as number}` : `p${(c.properties as Listing).id}`;
      nextIds.add(key);

      if (markersRef.current.has(key)) continue; // already rendered

      const el = document.createElement("div");

      if (isCluster) {
        const n    = c.properties.point_count as number;
        const size = n < 10 ? 36 : n < 100 ? 42 : 50;
        const cls  = n < 10 ? "sm" : n < 100 ? "md" : "lg";
        el.innerHTML = `<div class="cs-cluster cs-cluster--${cls}" style="width:${size}px;height:${size}px"><span>${n}</span></div>`;
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          try {
            const nextZoom = sc.getClusterExpansionZoom(c.id as number);
            map.flyTo({ center: c.geometry.coordinates as [number, number], zoom: nextZoom, duration: 400 });
          } catch {}
        });
      } else {
        const listing = listingMapRef.current.get((c.properties as Listing).id);
        if (!listing) continue;
        el.className = "cs-pin";
        el.innerHTML = makePinHtml(listing, listing.id === selectedIdRef.current, privateIdsRef.current.has(listing.id));
        el.style.cursor = "pointer";
        el.addEventListener("click",      (e) => { e.stopPropagation(); onListingClickRef.current(listing); });
        el.addEventListener("mouseenter", ()  => { hoveredKeyRef.current = key; onListingHoverRef.current(listing); });
        el.addEventListener("mouseleave", ()  => { hoveredKeyRef.current = null; onListingLeaveRef.current(); });
      }

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat(c.geometry.coordinates as [number, number])
        .addTo(map);
      markersRef.current.set(key, marker);
    }

    // Remove markers that are no longer visible
    for (const [key, marker] of markersRef.current) {
      if (!nextIds.has(key)) {
        marker.remove();
        markersRef.current.delete(key);
        if (hoveredKeyRef.current === key) {
          hoveredKeyRef.current = null;
          onListingLeaveRef.current();
        }
      }
    }
  }, []);

  // ── Map initialization (mount only) ──────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const saved  = getSavedPos();
    const center = saved?.center ?? ([21.0122, 52.2297] as [number, number]);
    const zoom   = saved?.zoom   ?? 13;

    const map = new maplibregl.Map({
      container:         containerRef.current,
      style:             MAP_STYLES[mapMode],
      center,
      zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("style.load", () => {
      addOverlaySources(map);
      updateMarkers();
    });

    map.once("load", () => {
      onMapReadyRef.current(map);
      onViewChangeRef.current(map.getZoom(), map.getBounds());
    });

    map.on("moveend", () => { savePos(map); onViewChangeRef.current(map.getZoom(), map.getBounds()); updateMarkers(); });
    map.on("zoomend", () => { savePos(map); onViewChangeRef.current(map.getZoom(), map.getBounds()); updateMarkers(); });

    map.on("click", (e) => {
      if (!showSelectedPointRef.current) return;
      if (areaModeRef.current === "polygon") {
        onPolygonPointRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      } else {
        onMapClickRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
      }
    });

    // RAF-throttled mousemove
    let rafId: number | null = null;
    let lastLngLat: maplibregl.LngLat | null = null;
    map.on("mousemove", (e) => {
      lastLngLat = e.lngLat;
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (lastLngLat) onCursorMoveRef.current({ lat: lastLngLat.lat, lng: lastLngLat.lng });
        });
      }
    });
    map.on("mouseout", () => { onCursorMoveRef.current(null); });

    // iOS Safari ResizeObserver
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();
for (const m of vertexMarkersRef.current) m.remove();
      vertexMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Style switching ─────────────────────────────���──────────────────────────���──

  const mapModeRef = useRef(mapMode);
  useEffect(() => {
    if (mapMode === mapModeRef.current) return;
    mapModeRef.current = mapMode;
    mapRef.current?.setStyle(MAP_STYLES[mapMode]);
    // Overlay sources are re-added inside the style.load handler above
  }, [mapMode]);

  // ── Listings → supercluster ────────────────────────────────────────────���──────

  useEffect(() => {
    listingMapRef.current.clear();
    for (const l of listings) listingMapRef.current.set(l.id, l);

    const sc = new Supercluster({ radius: 40, maxZoom: 16 });
    sc.load(listings.map((l) => ({
      type:       "Feature" as const,
      geometry:   { type: "Point" as const, coordinates: [l.longitude, l.latitude] as [number, number] },
      properties: l,
    })));
    scRef.current = sc;

    // Clear all existing markers and redraw
    for (const m of markersRef.current.values()) m.remove();
    markersRef.current.clear();
    updateMarkers();
  }, [listings, updateMarkers]);

  // ── Selected listing highlight ─────────────────────────────��──────────────────

  useEffect(() => {
    const prev = selectedIdRef.current;
    const next = selectedListing?.id ?? null;
    if (prev === next) return;

    // Redraw previously-selected marker
    if (prev) {
      const marker  = markersRef.current.get(`p${prev}`);
      const listing = listingMapRef.current.get(prev);
      if (marker && listing) {
        marker.getElement().innerHTML = makePinHtml(listing, false, privateIdsRef.current.has(prev));
      }
    }
    // Redraw newly-selected marker
    if (next) {
      const marker  = markersRef.current.get(`p${next}`);
      const listing = listingMapRef.current.get(next);
      if (marker && listing) {
        marker.getElement().innerHTML = makePinHtml(listing, true, privateIdsRef.current.has(next));
      }
    }

    selectedIdRef.current = next;
  }, [selectedListing]);

  // ── Area overlay for selected listing ───────────────────────���────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("area")) return;

    const src = map.getSource("area") as maplibregl.GeoJSONSource;
    if (!selectedListing?.area) {
      const empty = { type: "FeatureCollection" as const, features: [] };
      areaDataRef.current = empty;
      src.setData(empty);
      return;
    }

    const color = toHex(pinColor(selectedListing));
    const { area, latitude: lat, longitude: lng } = selectedListing;
    let coords: [number, number][];

    if (area.type === "circle") {
      coords = geoCircle(lat, lng, area.radius);
    } else {
      coords = area.points.map((p) => [p.lng, p.lat] as [number, number]);
      coords.push(coords[0]); // close ring
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features: any[] = [
      { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: { color } },
    ];
    if (area.type === "circle") {
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { color } });
    }
    const data = { type: "FeatureCollection" as const, features };
    areaDataRef.current = data;
    src.setData(data);
  }, [selectedListing]);

  // ── Draft area (when adding a listing) ───────────────────────────────��───────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("draft")) return;

    const src = map.getSource("draft") as maplibregl.GeoJSONSource;

    if (!showSelectedPointMarker || !selectedPoint) {
      const empty = { type: "FeatureCollection" as const, features: [] };
      draftDataRef.current = empty;
      src.setData(empty);
      return;
    }

    const color = toHex(DRAFT_COLOR);
    const center = { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [selectedPoint.longitude, selectedPoint.latitude] }, properties: { color } };

    if (areaMode === "circle") {
      const coords = geoCircle(selectedPoint.latitude, selectedPoint.longitude, circleRadius);
      const data = {
        type: "FeatureCollection" as const,
        features: [
          { type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [coords] }, properties: { color } },
          center,
        ],
      };
      draftDataRef.current = data;
      src.setData(data);
    } else if (areaMode === "point") {
      const data = { type: "FeatureCollection" as const, features: [center] };
      draftDataRef.current = data;
      src.setData(data);
    } else {
      const empty = { type: "FeatureCollection" as const, features: [] };
      draftDataRef.current = empty;
      src.setData(empty);
    }
  }, [showSelectedPointMarker, selectedPoint, areaMode, circleRadius]);

  // ── Polygon draft vertices ─────────────────────────────���──────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old vertex markers
    for (const m of vertexMarkersRef.current) m.remove();
    vertexMarkersRef.current = [];

    if (!showSelectedPointMarker || areaMode !== "polygon" || polygonDraftPoints.length === 0) {
      if (map.getSource("draft")) {
        const empty = { type: "FeatureCollection" as const, features: [] };
        draftDataRef.current = empty;
        (map.getSource("draft") as maplibregl.GeoJSONSource).setData(empty);
      }
      return;
    }

    const draftHex = toHex(DRAFT_COLOR);

    // Helper to rebuild draft line/polygon GeoJSON
    const updateDraftGeo = (pts: Array<{ lat: number; lng: number }>) => {
      const src = map.getSource("draft") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const coords = pts.map((p) => [p.lng, p.lat] as [number, number]);
      let data: { type: "FeatureCollection"; features: object[] };
      if (pts.length >= 3) {
        data = {
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[...coords, coords[0]]] }, properties: { color: draftHex } }],
        };
      } else if (pts.length >= 2) {
        data = {
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: { color: draftHex } }],
        };
      } else {
        return;
      }
      draftDataRef.current = data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      src.setData(data as any);
    };

    updateDraftGeo(polygonDraftPoints);

    // Create draggable vertex markers
    polygonDraftPoints.forEach((p, i) => {
      const el = document.createElement("div");
      el.innerHTML = `<svg width="20" height="20" viewBox="-10 -10 20 20" style="overflow:visible"><circle r="7" fill="white" stroke="${DRAFT_COLOR}" stroke-width="2.5"/><circle r="3" fill="${DRAFT_COLOR}"/></svg>`;
      el.className = "cs-pin";

      const marker = new maplibregl.Marker({ element: el, anchor: "center", draggable: true })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      marker.on("drag", () => {
        const ll = marker.getLngLat();
        const updated = vertexPtsRef.current.map((pt, j) =>
          j === i ? { lat: ll.lat, lng: ll.lng } : pt,
        );
        vertexPtsRef.current = updated;
        updateDraftGeo(updated);
      });

      marker.on("dragend", () => {
        onPolygonPointsChangeRef.current([...vertexPtsRef.current]);
      });

      el.addEventListener("click", (e) => e.stopPropagation());

      vertexMarkersRef.current.push(marker);
    });
  }, [polygonDraftPoints, polygonFinished, showSelectedPointMarker, areaMode]);


  // ──────────────���──────────────────────────────────────────────────────────────

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}

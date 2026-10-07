'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  GeoJSON,
  useMap,
  CircleMarker,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { createClient } from '@supabase/supabase-js'
import type { Feature, FeatureCollection, Geometry } from 'geojson'

// Perbaikan default marker icon Leaflet yang rusak akibat bundling Next.js
// @ts-expect-error - properti internal Leaflet, tidak ada di tipe publik
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
)

export interface SurveyProperties {
  nop: string
  wp: string
  kondisi_eksisting: string | null
  luas_bgn: number | null
  shape_area: number | null
  [key: string]: unknown
}

export type BasemapConfig =
  | { type: 'osm' }
  | { type: 'dark' }
  | { type: 'wms'; url: string; layers: string }
  | { type: 'xyz'; url: string }

interface MapComponentProps {
  isDark: boolean
  editMode: boolean
  basemap: BasemapConfig
  activeTableIds: string[]
  onFeatureSelect: (properties: SurveyProperties) => void
  onFeatureCreate?: (geometry: any) => void
  wmsUrl?: string
  wmsLayers?: string
  customXyzUrl?: string
  refreshTrigger?: number
  locateTrigger?: number
}

// Komponen untuk membaca GPS dan menampilkan titik biru secara real-time
function LocationMarker({ trigger }: { trigger: number }) {
  const [position, setPosition] = useState<any>(null);
  const map = useMap();

  // 1. Memulai pelacakan lokasi secara terus-menerus saat peta dimuat
  useEffect(() => {
    // watch: true membuat GPS terus memantau pergerakan
    // enableHighAccuracy: true menggunakan sensor GPS asli HP (bukan perkiraan jaringan)
    map.locate({ watch: true, enableHighAccuracy: true, maximumAge: 10000 });

    const handleLocationFound = (e: any) => {
      setPosition(e.latlng); // Update titik biru otomatis saat bergerak
    };

    const handleLocationError = (e: any) => {
      console.warn("Gagal mendapatkan lokasi akurat:", e.message);
    };

    map.on("locationfound", handleLocationFound);
    map.on("locationerror", handleLocationError);

    // Hapus pelacakan jika komponen ditutup untuk menghemat baterai
    return () => {
      map.stopLocate();
      map.off("locationfound", handleLocationFound);
      map.off("locationerror", handleLocationError);
    };
  }, [map]);

  // 2. Tombol Trigger hanya berfungsi untuk menarik layar (zoom) ke lokasi saat ini
  useEffect(() => {
    if (trigger > 0 && position) {
      map.flyTo(position, 19, { animate: true, duration: 1.5 });
    } else if (trigger > 0 && !position) {
      alert("Sedang mencari sinyal GPS, silakan tunggu beberapa detik dan coba klik lagi.");
    }
  }, [trigger, map, position]); // <-- Hapus 'position' dari array ini jika tidak ingin layar otomatis bergeser setiap kali Anda melangkah

  return position === null ? null : (
    <CircleMarker 
      center={position} 
      radius={8} 
      pathOptions={{ color: 'white', fillColor: '#2563eb', fillOpacity: 1, weight: 3 }}
    />
  );
}

// Pemetaan kontrol Geoman
function GeomanControls({ editMode }: { editMode: boolean }) {
  const map = useMap()

  useEffect(() => {
    const pm = map.pm
    if (!pm) return

    if (editMode) {
      pm.addControls({
        position: 'bottomleft',
        drawMarker: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawRectangle: false,
        drawCircle: false,
        drawText: false,
        editMode: true,
        dragMode: true,
        cutPolygon: false,
        removalMode: false,
      })
      pm.setGlobalOptions({ snappable: true, snapDistance: 18 })
    } else {
      pm.removeControls()
    }

    return () => {
      pm.removeControls()
    }
  }, [editMode, map])

  return null
}

// Tempelkan kode ini di dalam file components/MapComponent.tsx
function DrawListener({ onFeatureCreate }: { onFeatureCreate?: (geometry: any) => void }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const handleCreate = (e: any) => {
      const layer = e.layer;
      const geoJsonGeometry = layer.toGeoJSON().geometry;
      
      // Hapus layer sementara dari peta karena nanti akan dirender ulang dari database
      map.removeLayer(layer);

      if (onFeatureCreate) {
        onFeatureCreate(geoJsonGeometry);
      }
    };

    map.on('pm:create', handleCreate);

    return () => {
      map.off('pm:create', handleCreate);
    };
  }, [map, onFeatureCreate]);

  return null;
}

export default function MapComponent({
  isDark,
  editMode,
  basemap,
  activeTableIds,
  onFeatureSelect,
  onFeatureCreate,
  wmsUrl,
  wmsLayers, 
  customXyzUrl,
  refreshTrigger,
  locateTrigger
}: MapComponentProps) {
  const [layers, setLayers] = useState<Record<string, FeatureCollection>>({})
  const geoJsonRefs = useRef<Record<string, L.GeoJSON>>({})

  useEffect(() => {
    let cancelled = false

    async function loadTables() {
      const entries = await Promise.all(
        activeTableIds.map(async (id) => {
          const tableName = id
          if (!tableName) return [id, null] as const

          const { data, error } = await supabase.rpc('get_polygon_geojson', {
            table_name: tableName,
          })

          if (error) {
            console.error(`Gagal memuat ${tableName}:`, error.message)
            return [id, null] as const
          }

          return [id, data as FeatureCollection] as const
        }),
      )

      if (cancelled) return

      setLayers((prev) => {
        const next = { ...prev }
        for (const [id, fc] of entries) {
          if (fc) next[id] = fc
        }
        return next
      })
    }

    loadTables()
    return () => {
      cancelled = true
    }
  }, [activeTableIds, refreshTrigger])

  const handleFeatureClick = (feature: Feature<Geometry, SurveyProperties>) => {
    onFeatureSelect({
      ...feature.properties,
      geom: feature.geometry
    })
  }

  return (
    <MapContainer
      center={[-6.1751, 106.8650]}
      zoom={13}
      zoomControl={false}
      attributionControl={false}
      className="absolute inset-0 z-0 h-full w-full"
    >
      {basemap.type === 'osm' && (
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
      )}

      {basemap.type === 'dark' && (
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      )}

      {customXyzUrl && customXyzUrl.trim() !== '' && (
        <TileLayer
          key={customXyzUrl}
          url={customXyzUrl}
          maxZoom={22}
          zIndex={5}
        />
      )}

      {wmsUrl && wmsUrl.trim() !== '' && wmsLayers && wmsLayers.trim() !== '' && (
        <WMSTileLayer
          key={`${wmsUrl}-${wmsLayers}`}
          url={wmsUrl}
          layers={wmsLayers}
          format="image/png"
          transparent={true}
          zIndex={10} 
        />
      )}

      {activeTableIds.map((id) => {
        const layerData = layers[id]
        if (!layerData) return null

        const uniqueKey = `${id}-${JSON.stringify(layerData).length}`

        return (
          <GeoJSON
            key={uniqueKey}
            data={layerData}
            ref={(instance: L.GeoJSON | null) => {
              if (instance) geoJsonRefs.current[id] = instance
            }}
            style={() => ({
              color: isDark ? '#34d399' : '#059669',
              weight: 2,
              fillColor: isDark ? '#34d399' : '#10b981',
              fillOpacity: 0.4,
            })}
            onEachFeature={(feature, layer) => {
              layer.on('click', () => {
                handleFeatureClick(feature as any)
              })
            }}
          />
        )
      })}

      <GeomanControls editMode={editMode} />
      <LocationMarker trigger={locateTrigger || 0} />
      <DrawListener onFeatureCreate={onFeatureCreate} />
    </MapContainer>
  )
}
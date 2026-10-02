'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  GeoJSON,
  useMap,
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
  wmsUrl?: string;
  wmsLayers?: string;
  customXyzUrl?: string;
}

// Pemetaan id tab UI -> nama tabel PostGIS di Supabase
function GeomanControls({ editMode }: { editMode: boolean }) {
  const map = useMap()

  useEffect(() => {
    // leaflet-geoman menambahkan .pm ke instance map saat runtime
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

export default function MapComponent({
  isDark,
  editMode,
  basemap,
  activeTableIds,
  onFeatureSelect,
  wmsUrl,
  wmsLayers, 
  customXyzUrl
}: MapComponentProps) {
  const [layers, setLayers] = useState<Record<string, FeatureCollection>>({})
  const geoJsonRefs = useRef<Record<string, L.GeoJSON>>({})

  // Ambil GeoJSON per tabel aktif lewat RPC Supabase (ST_AsGeoJSON di sisi DB).
  // Buat fungsi Postgres `get_polygon_geojson(table_name text)` yang mengembalikan
  // sebuah FeatureCollection agar endpoint ini bisa langsung dipakai.
  useEffect(() => {
    let cancelled = false

    async function loadTables() {
      const entries = await Promise.all(
        activeTableIds.map(async (id) => {
          const tableName = id;
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
  }, [activeTableIds])

  const handleFeatureClick = (feature: Feature<Geometry, SurveyProperties>) => {
  onFeatureSelect({
    ...feature.properties,
    geom: feature.geometry
  })
}

  return (
    <MapContainer
      center={[-6.3, 106.85]}
      zoom={10}
      zoomControl={false}
      attributionControl={false}
      className="absolute inset-0 z-0 h-full w-full"
    >
      {basemap.type === 'osm' && (
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
      )}

      {customXyzUrl && customXyzUrl.trim() !== '' && (
          <TileLayer
            key={customXyzUrl}
            url={customXyzUrl}
            maxZoom={22}
            zIndex={5}
          />
        )}

        {/* Layer WMS Kustom */}
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
  const layerData = layers[id];
  if (!layerData) return null;

  // Trik kunci: Menambahkan panjang string JSON ke dalam key 
  // memaksa React Leaflet merender ulang jika data/statusnya berubah
  const uniqueKey = `${id}-${JSON.stringify(layerData).length}`;

  return (
    <GeoJSON
      key={uniqueKey}
      data={layerData}
      ref={(instance: L.GeoJSON | null) => {
        if (instance) geoJsonRefs.current[id] = instance;
      }}
      style={() => ({
        color: isDark ? '#34d399' : '#059669',
        weight: 2,
        fillColor: isDark ? '#34d399' : '#10b981',
        fillOpacity: 0.4,
      })}
      onEachFeature={(feature, layer) => {
        // Mengirimkan data atribut poligon ke formulir saat diklik
        layer.on('click', () => {
          handleFeatureClick(feature as any);
        });
      }}
    />
  );
})}

      {/* Peta dasar tetap read-only; hanya geometri di layer GeoJSON di atas
          yang bisa diedit, dan hanya ketika Mode Edit Spasial aktif. */}
      <GeomanControls editMode={editMode} />
    </MapContainer>
  )
}

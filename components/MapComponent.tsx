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
}

// Pemetaan id tab UI -> nama tabel PostGIS di Supabase
const TABLE_MAP: Record<string, string> = {
  'polygon-utama': 'bidang_pajak_utama',
  'polygon-kedua': 'bidang_pajak_kedua',
  'polygon-ketiga': 'bidang_pajak_ketiga',
}

/**
 * Menjembatani plugin imperatif leaflet-geoman ke dalam React tree.
 * Butuh akses ke instance map via useMap(), sehingga harus jadi child
 * dari <MapContainer>, bukan digabung langsung ke komponen utama.
 */
function GeomanControls({ editMode }: { editMode: boolean }) {
  const map = useMap()

  useEffect(() => {
    // @ts-expect-error - leaflet-geoman menambahkan .pm ke instance map saat runtime
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
          const tableName = TABLE_MAP[id]
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
    onFeatureSelect(feature.properties)
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
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      )}
      {basemap.type === 'dark' && (
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      )}
      {basemap.type === 'wms' && (
        <WMSTileLayer url={basemap.url} layers={basemap.layers} format="image/png" transparent />
      )}
      {basemap.type === 'xyz' && <TileLayer url={basemap.url} />}

      {activeTableIds.map((id) =>
        layers[id] ? (
          <GeoJSON
            key={id}
            data={layers[id]}
            ref={(instance: L.GeoJSON | null) => {
              if (instance) geoJsonRefs.current[id] = instance
            }}
            style={() => ({
              color: isDark ? '#34d399' : '#059669',
              weight: 2,
              fillColor: isDark ? '#34d399' : '#10b981',
              fillOpacity: 0.25,
            })}
            onEachFeature={(feature, layer) => {
              layer.on('click', () =>
                handleFeatureClick(feature as Feature<Geometry, SurveyProperties>),
              )
            }}
          />
        ) : null,
      )}

      {/* Peta dasar tetap read-only; hanya geometri di layer GeoJSON di atas
          yang bisa diedit, dan hanya ketika Mode Edit Spasial aktif. */}
      <GeomanControls editMode={editMode} />
    </MapContainer>
  )
}

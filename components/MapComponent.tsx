'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  GeoJSON,
  useMap,
  CircleMarker,
  Circle,
  LayersControl,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { createClient } from '@supabase/supabase-js'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import parseGeoraster from 'georaster';
import GeoRasterLayer from 'georaster-layer-for-leaflet';

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
  | { type: 'none' }
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
  showDroneImagery?: boolean
}

function COGLayer({ url }: { url: string }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !url) return;

    let layer: any = null;
    let isMounted = true;

    // Tambahkan tipe ': any' di dalam kurung parameter georaster
    parseGeoraster(url).then((georaster: any) => { 
      if (!isMounted) return;
      layer = new GeoRasterLayer({
        georaster: georaster,
        opacity: 1,
        resolution: 256, 
        // Tambahkan koma setelah 256, lalu sisipkan fungsi ini:
        pixelValuesToColorFn: (values: any) => {
          if (values[0] === undefined) return null;

          // Baca nilai Y, Cb, dan Cr dari file JPEG-COG
          const y = values[0];
          const cb = values[1];
          const cr = values[2];

          // Konversi matematis format YCbCr kembali menjadi RGB murni
          let r = Math.round(y + 1.402 * (cr - 128));
          let g = Math.round(y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128));
          let b = Math.round(y + 1.772 * (cb - 128));

          // Kunci rentang warna agar tidak bocor (wajib di antara 0 hingga 255)
          r = Math.max(0, Math.min(255, r));
          g = Math.max(0, Math.min(255, g));
          b = Math.max(0, Math.min(255, b));

          // Sembunyikan piksel latar belakang (putih bersih atau hitam pekat)
          if ((r >= 250 && g >= 250 && b >= 250) || (r === 0 && g === 0 && b === 0)) {
            return null; // Render sebagai transparan
          }

          // Tampilkan warna bangunan aslinya
          return `rgb(${r}, ${g}, ${b})`;
        }
      });
      layer.addTo(map);
      
      map.fitBounds(layer.getBounds());
      
    // Tambahkan tipe ': any' di dalam kurung parameter err
    }).catch((err: any) => {
      console.error("Gagal memuat citra satelit:", err);
    });

    return () => {
      isMounted = false;
      if (layer && map) {
        map.removeLayer(layer);
      }
    };
  }, [map, url]);

  return null;
}

// Komponen untuk membaca GPS dan menampilkan titik biru beserta radius akurasi
function LocationMarker({ trigger }: { trigger: number }) {
  const [position, setPosition] = useState<any>(null);
  const [accuracy, setAccuracy] = useState<number>(0); // Menyimpan radius error GPS dalam meter
  const map = useMap();

  // 1. Memulai pelacakan lokasi secara diam-diam di latar belakang
  useEffect(() => {
    map.locate({ watch: true, enableHighAccuracy: true, maximumAge: 10000 });

    const handleLocationFound = (e: any) => {
      setPosition(e.latlng);
      setAccuracy(e.accuracy); // Mengambil tingkat akurasi dari sensor HP
    };

    const handleLocationError = (e: any) => {
      console.warn("Gagal mendapatkan lokasi akurat:", e.message);
    };

    map.on("locationfound", handleLocationFound);
    map.on("locationerror", handleLocationError);

    return () => {
      map.stopLocate();
      map.off("locationfound", handleLocationFound);
      map.off("locationerror", handleLocationError);
    };
  }, [map]);

  // 2. Tombol Trigger HANYA menggeser layar ketika tombol diklik (tidak auto-zoom lagi)
  useEffect(() => {
    if (trigger > 0 && position) {
      map.flyTo(position, 19, { animate: true, duration: 1.5 });
    } else if (trigger > 0 && !position) {
      alert("Sedang mencari sinyal GPS, silakan tunggu beberapa detik dan coba klik lagi.");
    }
  }, [trigger, map]); // <--- 'position' telah dihapus dari array ini agar tidak mengganggu layar

  return position === null ? null : (
    <>
      {/* Lingkaran biru memudar (menunjukkan seberapa meleset/akurat sinyal saat ini) */}
      <Circle 
        center={position} 
        radius={accuracy} 
        pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, stroke: false }} 
      />
      {/* Titik biru solid di tengah */}
      <CircleMarker 
        center={position} 
        radius={7} 
        pathOptions={{ color: 'white', fillColor: '#2563eb', fillOpacity: 1, weight: 2 }}
      />
    </>
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
  locateTrigger,
  showDroneImagery = true,
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
      maxZoom={24} // <-- 1. Tambahkan batas maksimal zoom pada kanvas utama
      zoomControl={false}
      attributionControl={false}
      className="absolute inset-0 z-0 h-full w-full"
    >
      {basemap.type === 'osm' && (
        <TileLayer 
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" 
          maxNativeZoom={19} // <-- 2. Hentikan unduhan tile OSM di level 19 (batas maksimal bawaan)
          maxZoom={24}       // <-- 3. Izinkan gambar tile ditarik/diperbesar hingga level 24
        />
      )}

      {basemap.type === 'dark' && (
        <TileLayer 
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
          maxNativeZoom={19} 
          maxZoom={24} 
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
      {showDroneImagery && (
        <COGLayer url="https://ntnjmzknnlcwyvnohylw.supabase.co/storage/v1/object/public/citra_udara/citra_udara_cempaka_baru.tif" />
      )}
    </MapContainer>
  )
}
'use client'

import dynamic from 'next/dynamic'
import { Bungee } from 'next/font/google'
import {
  Sun,
  Moon,
  Layers as LayersIcon,
  X,
  ChevronDown,
  Pencil,
  Camera,
  ImageUp,
} from 'lucide-react'
import { useRef, useState, useEffect, type ChangeEvent } from 'react'
import type { BasemapConfig, SurveyProperties } from '@/components/MapComponent'

const graffiti = Bungee({ subsets: ['latin'], weight: '400' })

// react-leaflet menyentuh window/document, jadi wajib dimuat tanpa SSR
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 z-0 flex items-center justify-center bg-slate-100">
      <span className="text-sm font-medium text-slate-400">Memuat peta…</span>
    </div>
  ),
})

interface TableTab {
  id: string
  label: string
}

const TABLE_TABS: TableTab[] = [
  { id: 'polygon-utama', label: 'Nama Tabel Data Polygon' },
  { id: 'polygon-kedua', label: 'Tabel Data Polygon Kedua' },
  { id: 'polygon-ketiga', label: 'Tabel Data Polygon Ketiga' },
]

const KONDISI_OPTIONS = ['Baik', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Berat', 'Lahan Kosong']

export default function SmartaxSurveyorPage() {
  const [isDark, setIsDark] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelTab, setPanelTab] = useState<'layers' | 'basemap'>('layers')
  const [editMode, setEditMode] = useState(false)

  const [basemap, setBasemap] = useState<BasemapConfig>({ type: 'osm' })
  const [wmsUrl, setWmsUrl] = useState('')
  const [wmsLayers, setWmsLayers] = useState('')
  const [customXyzUrl, setCustomXyzUrl] = useState('')

  const [activeTables, setActiveTables] = useState<string[]>(['polygon-utama'])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedFeature, setSelectedFeature] = useState<SurveyProperties | null>(null)
  const [kondisiValue, setKondisiValue] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false) // 1. Tambahkan variabel baru ini

  useEffect(() => {
    setIsMounted(true)
    // Beri jeda 100 milidetik sebelum membuka panel
    setTimeout(() => {
      setSheetOpen(true)
    }, 100)
  }, [])

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const toggleTable = (id: string) => {
    setActiveTables((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  const handleFeatureSelect = (properties: SurveyProperties) => {
    setSelectedFeature(properties)
    setKondisiValue(properties.kondisi_eksisting ?? '')
    setPhotoPreview(null)
    setSheetOpen(true)
  }

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleSavePhoto = async () => {
    if (!selectedFeature) return
    // TODO: upload ke Supabase Storage lalu update baris terkait NOP: selectedFeature.nop
    console.log('Menyimpan foto untuk NOP', selectedFeature.nop)
  }

  return (
    <main className={`relative h-dvh w-full overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
      <MapComponent
        isDark={isDark}
        editMode={editMode}
        basemap={basemap}
        activeTableIds={activeTables}
        onFeatureSelect={handleFeatureSelect}
      />

      {/* Kiri atas: branding KSC ala urban/graffiti */}
      <div className="absolute left-4 top-4 z-50">
        <div
          className={`${graffiti.className} select-none rounded-xl border-2 border-black bg-white px-3 py-1.5 text-2xl tracking-wide text-black shadow-[3px_3px_0_0_rgba(0,0,0,1)]`}
        >
          KSC
        </div>
      </div>

      {/* Kanan atas: kontrol peta (glassmorphism) */}
      <div className="absolute right-4 top-4 z-50 flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-2xl border border-white/40 bg-white/70 p-1 shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsDark(false)}
            aria-label="Mode terang"
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
              !isDark ? 'bg-white shadow' : 'text-slate-400'
            }`}
          >
            <Sun size={18} className={!isDark ? 'text-amber-500' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setIsDark(true)}
            aria-label="Mode gelap"
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
              isDark ? 'bg-white shadow' : 'text-slate-400'
            }`}
          >
            <Moon size={18} className={isDark ? 'text-slate-700' : ''} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-label="Layer"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/40 bg-white/70 text-slate-700 shadow-lg backdrop-blur-md"
        >
          <LayersIcon size={18} />
        </button>
      </div>

      {/* Panel dropdown: tab Layers / Basemap */}
      {panelOpen && (
        <div className="absolute right-4 top-[4.75rem] z-50 w-72 overflow-hidden rounded-2xl border border-white/40 bg-white/95 shadow-xl backdrop-blur-md">
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setPanelTab('layers')}
              className={`flex-1 py-3 text-sm font-semibold ${
                panelTab === 'layers' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400'
              }`}
            >
              Layers
            </button>
            <button
              type="button"
              onClick={() => setPanelTab('basemap')}
              className={`flex-1 py-3 text-sm font-semibold ${
                panelTab === 'basemap' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400'
              }`}
            >
              Basemap
            </button>
          </div>

          <div className="max-h-80 space-y-3 overflow-y-auto p-4">
            {panelTab === 'layers' && (
              <>
                <div className="flex items-center justify-between text-sm text-slate-700">
                  <span>Mode Edit Spasial</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editMode}
                    onClick={() => setEditMode((v) => !v)}
                    className={`h-6 w-11 rounded-full transition ${editMode ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition ${
                        editMode ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Aktifkan untuk mengedit geometri langsung di peta (snapping otomatis via
                  leaflet-geoman).
                </p>

                <div className="space-y-2 pt-2">
                  {TABLE_TABS.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={activeTables.includes(t.id)}
                        onChange={() => toggleTable(t.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </>
            )}

            {panelTab === 'basemap' && (
              <>
                <button
                  type="button"
                  onClick={() => setBasemap({ type: 'osm' })}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    basemap.type === 'osm' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'
                  }`}
                >
                  OpenStreetMap
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap({ type: 'dark' })}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    basemap.type === 'dark' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'
                  }`}
                >
                  Dark Basemap
                </button>

                <div className="space-y-1 pt-1">
                  <p className="text-xs font-semibold text-slate-500">WMS Bapenda</p>
                  <input
                    value={wmsUrl}
                    onChange={(e) => setWmsUrl(e.target.value)}
                    placeholder="URL WMS"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={wmsLayers}
                    onChange={(e) => setWmsLayers(e.target.value)}
                    placeholder="Nama layer"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      wmsUrl && wmsLayers && setBasemap({ type: 'wms', url: wmsUrl, layers: wmsLayers })
                    }
                    className="w-full rounded-lg bg-slate-900 py-1.5 text-sm font-medium text-white"
                  >
                    Terapkan WMS
                  </button>
                </div>

                <div className="space-y-1 pt-2">
                  <p className="text-xs font-semibold text-slate-500">XYZ Tiles Kustom</p>
                  <input
                    value={customXyzUrl}
                    onChange={(e) => setCustomXyzUrl(e.target.value)}
                    placeholder="https://.../{z}/{x}/{y}.png"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => customXyzUrl && setBasemap({ type: 'xyz', url: customXyzUrl })}
                    className="w-full rounded-lg bg-slate-900 py-1.5 text-sm font-medium text-white"
                  >
                    Terapkan XYZ
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bilah bawah: navigasi tabel (pill hijau, scroll horizontal) */}
      <div className="absolute inset-x-0 bottom-24 z-40 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABLE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => toggleTable(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium shadow transition ${
              activeTables.includes(t.id) ? 'bg-emerald-600 text-white' : 'bg-emerald-600/40 text-white/90'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* Bottom sheet: formulir survei (Native Tailwind) */}
          <div
            className={`fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-3xl bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.15)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              sheetOpen ? 'translate-y-0' : 'translate-y-[110%]'
            }`}
            style={{ maxHeight: '85vh', height: '45vh' }}
          >
            {/* Header / Handle */}
            <div className="flex flex-col bg-white rounded-t-3xl border-b border-slate-100">
              <div className="flex w-full justify-center pb-2 pt-3">
                <div className="h-1.5 w-12 rounded-full bg-slate-300" />
              </div>
              <div className="flex items-center justify-between px-4 pb-3 pt-1">
                <div className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
                  {activeTables.map((id) => {
                    const tab = TABLE_TABS.find((t) => t.id === id)
                    if (!tab) return null
                    return (
                      <span
                        key={id}
                        className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                      >
                        {tab.label}
                        <button type="button" onClick={() => toggleTable(id)} aria-label={`Hapus ${tab.label}`}>
                          <X size={12} />
                        </button>
                      </span>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2 pl-3">
                  <button
                    type="button"
                    aria-label="Edit"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Tutup"
                    onClick={() => setSheetOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-white"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Konten Scrollable */}
            <div className="flex-1 overflow-y-auto space-y-4 px-4 pb-8 pt-4 bg-white">
              <div>
                <p className="text-lg font-bold text-slate-900">NOP: {selectedFeature?.nop ?? '-'}</p>
                <p className="text-sm text-slate-500">WP: {selectedFeature?.wp ?? '-'}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Kondisi_Eksisting
                </label>
                <select
                  value={kondisiValue}
                  onChange={(e) => setKondisiValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">Kondisi Bidang Bangunan</option>
                  {KONDISI_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Luas_Bgn</label>
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-400">
                  {selectedFeature?.luas_bgn ?? 'Nilai Luas Bangunan'}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Shape_Area</label>
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
                  {selectedFeature?.shape_area ?? '-'}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Dokumentasi
                </label>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-sky-200 bg-sky-50 text-sm font-medium text-sky-700"
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Pratinjau foto" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <Camera size={18} />
                      Buka Kamera Ponsel
                    </span>
                  )}
                </button>

                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={handleSavePhoto}
                    className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white"
                  >
                    Simpan Foto
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-400 py-2.5 text-sm font-semibold text-slate-900"
                  >
                    <ImageUp size={16} />
                    Upload Dari Galeri
                  </button>
                </div>
              </div>
            </div>
          </div>
    </main>
  )
}

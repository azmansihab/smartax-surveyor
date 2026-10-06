'use client'

import dynamic from 'next/dynamic'
import { Bungee } from 'next/font/google'
import { createClient } from '@supabase/supabase-js'
import {
  Sun,
  Moon,
  Layers as LayersIcon,
  X,
  ChevronDown,
  Pencil,
  Camera,
  ImageUp,
  Trash2,
  LocateFixed,
} from 'lucide-react'
import { useRef, useState, useEffect, type ChangeEvent } from 'react'
import type { BasemapConfig, SurveyProperties } from '@/components/MapComponent'

const graffiti = Bungee({ subsets: ['latin'], weight: '400' })

// react-leaflet menyentuh window/document, jadi wajib dimuat tanpa SSR
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  loading: () => (
    <div className="flex items-center justify-center h-[400px]">
      <span className="text-sm font-medium text-slate-400">Memuat peta...</span>
    </div>
  ),
  ssr: false
});

interface TableTab {
  id: string
  label: string
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const OPT_JENIS_INPUT = ['A. PEREKAMAN DATA', 'B. PEMUTAKHIRAN DATA', 'C. PENGHAPUSAN DATA', 'D. PENGARSIPAN DATA', 'E. PENILAIAN INDIVIDUAL']; //[cite: 27]
const OPT_PENGGUNAAN = ['1a. Rumah Tinggal', '1b. Rumah Dikontrakkan', '1c. Rumah Kos / Guesthouse', '1d. Rumah Tinggal yang juga digunakan sebagai Tempat Usaha', '2a. Perkantoran Swasta', '2b. Perkantoran BUMN / BUMD', '2c. Universitas Negeri', '2d. Universitas Swasta / Sejenis', '2e. Mixed Use', '3. Pabrik', '4a. Toko / Kios / Apotek / Bengkel Motor', '4b. Ruko / Rukan', '4c. Restoran / Kafe', '4d. Ruko / Rukan yang digunakan sepenuhnya menjadi tempat tinggal', '5a. Rumah Sakit Pemerintah', '5b. Rumah Sakit Swasta', '5c. Klinik / Sejenis', '5d. Laboratorium Klinik', '6. Gymnasium', '7a. Hotel', '7b. Wisma', '7c. Asrama / Mess', '7d. Motel / Losmen / Hostel / Sejenis', '8a. Bengkel / Showroom Mobil', '8b. Gudang', '8c. Bangunan Pertanian / Peternakan', '8d. Workshop', '9. Gedung Pemerintah', '10. Lain-lain']; //[cite: 28]
const OPT_KONDISI = ['A. Sangat Baik', 'B. Baik', 'C. Sedang', 'D. Jelek']; //[cite: 29]
const OPT_KONSTRUKSI = ['A. Baja', 'B. Beton', 'C. Batu Bata', 'D. Kayu']; //[cite: 30]
const OPT_ATAP = ['A. Decrabon / Beton / Genteng / Genteng Glazur / Bitumen', 'B. Genteng Beton / Aluminium / PVC', 'C. Genteng Biasa / Sirap / Polycarbonat / GRC', 'D. Asbes', 'E. Seng']; //[cite: 31]
const OPT_LANTAI = ['A. Marmer / Granit / PVC / Homogeneous Tile / Vinyl', 'B. Keramik Standar / Epoxy', 'C. Teraso', 'D. Ubin PC / Papan', 'E. Semen']; //[cite: 33]
const OPT_LANGIT = ['A. Akustik / Jati / PVC / GRC / Gypsum', 'B. Triplek / Asbes / Bambu', 'C. Tidak Ada']; //[cite: 34]

export default function SmartaxSurveyorPage() {
  const [isDark, setIsDark] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<'layers' | 'basemap'>('layers');
  const [uploading, setUploading] = useState(false);
  const [mapRefreshTrigger, setMapRefreshTrigger] = useState(0);
  const [locateTrigger, setLocateTrigger] = useState(0);

  // 1. Buat state baru untuk menyimpan tab tabel yang dinamis
  const [tableTabs, setTableTabs] = useState<TableTab[]>([]);

  // 2. Tarik daftar nama SHP/tabel saat web pertama kali dibuka
  useEffect(() => {
    async function fetchTableNames() {
      // Pastikan Anda sudah mengimpor client supabase di file ini
      const { data, error } = await supabase.rpc('get_spatial_tables');

      if (data && !error) {
        // Mengubah format array dari Supabase menjadi format yang dibaca UI
        const dynamicTabs = data.map((namaTabel: string) => ({
          id: namaTabel,       // ID sistem menggunakan nama tabel (contoh: bidang_pajak_utama)
          label: namaTabel     // Judul di layar juga menggunakan nama tabel
        }));

        setTableTabs(dynamicTabs);
      }
    }

    fetchTableNames();
  }, []);

  const KONDISI_OPTIONS = ['Baik', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Berat', 'Lahan Kosong']
  const [editMode, setEditMode] = useState(false);
  const [basemap, setBasemap] = useState<BasemapConfig>({ type: 'osm' })
  const [wmsUrl, setWmsUrl] = useState('')
  const [wmsLayers, setWmsLayers] = useState('')
  const [customXyzUrl, setCustomXyzUrl] = useState('')

  const [activeTables, setActiveTables] = useState<string[]>(['bidang_pajak_utama'])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetSize, setSheetSize] = useState<'half' | 'full'>('half');
  const [selectedFeature, setSelectedFeature] = useState<SurveyProperties | null>(null)
  const [viewingTableId, setViewingTableId] = useState<string | null>(null);
  const [layerTableData, setLayerTableData] = useState<any[]>([]);
  const [isLoadingTable, setIsLoadingTable] = useState(false);

  // 1. State untuk menyimpan data form yang sedang diedit
  const [formData, setFormData] = useState<Record<string, any>>({});

  // 2. Mengisi form dengan data dari poligon yang diklik
useEffect(() => {
    if (selectedFeature) {
      setFormData(selectedFeature as any);
    }
  }, [selectedFeature]);

  // 3. Fungsi untuk menangani ketikan pada form
  const handleInputChange = (kolom: string, nilaiBaru: string) => {
    setFormData(prev => ({
      ...prev,
      [kolom]: nilaiBaru
    }));
  };

  // 4. Fungsi untuk menyimpan data ke Supabase
  const handleSimpanData = async () => {
    if (!selectedFeature || activeTables.length === 0) return;

    const namaTabelAktif = activeTables[0];

    // CATATAN: Ganti 'id' dengan Primary Key dari tabel Anda (biasanya 'id', 'gid', atau 'OBJECTID' jika hasil import QGIS)
    const pkColumn = 'id'; 
    const idPoligon = (selectedFeature as any)[pkColumn];

    if (!idPoligon) {
      alert(`Gagal: Kolom Primary Key '${pkColumn}' tidak ditemukan.`);
      return;
    }

    try {
      const { error } = await supabase
        .from(namaTabelAktif)
        .update(formData)
        .eq(pkColumn, idPoligon);

      if (error) throw error;

      alert('Data lapangan berhasil diperbarui!');
      setEditMode(false); // Keluar dari mode edit setelah sukses

    } catch (error: any) {
      alert('Gagal menyimpan data: ' + error.message);
    }
  };

// Helper untuk membersihkan dimensi Z/M agar tidak error PostGIS
  const stripZDimension = (geom: any) => {
    if (!geom || !geom.coordinates) return geom;
    const cleanCoords = (arr: any[]): any[] => {
      if (typeof arr[0] === 'number') return [arr[0], arr[1]];
      return arr.map(cleanCoords);
    };
    return { ...geom, coordinates: cleanCoords(geom.coordinates) };
  };

  // 5. Fungsi Salin Geometri & Pemetaan Atribut Terkontrol
  const handleCopyGeometry = async () => {
    if (!selectedFeature) {
      alert("Tidak ada poligon yang dipilih!");
      return;
    }

    try {
      const namaTabelAktif = activeTables[0];
      let originalGeom = selectedFeature.geom || (selectedFeature as any).geometry;

      if (!originalGeom) {
        const pkColumn = (selectedFeature as any).id ? 'id' : (selectedFeature as any).gid ? 'gid' : 'objectid';
        const idPoligon = (selectedFeature as any)[pkColumn];

        if (idPoligon) {
          const { data } = await supabase
            .from(namaTabelAktif)
            .select('geom')
            .eq(pkColumn, idPoligon)
            .single();

          if (data && data.geom) originalGeom = data.geom;
        }
      }

      if (!originalGeom) {
        alert("Geometri poligon tidak ditemukan di database!");
        return;
      }

      const cleanedGeom = stripZDimension(originalGeom);

      const lowerProps: Record<string, any> = {};
      Object.keys(selectedFeature).forEach((key) => {
        lowerProps[key.toLowerCase()] = (selectedFeature as any)[key];
      });

      // HANYA MASUKKAN KOLOM YANG SUDAH PASTI ADA DI TABEL BANGUNAN_RAW
      const newBangunanData: Record<string, any> = {
        geom: cleanedGeom,
        
        // 1. Mapping Atribut Utama
        nop_pengukuran: lowerProps.nop || lowerProps.nop_pengukuran || '',
        wp_pengukuran: lowerProps.nama_wp || lowerProps.wp_pengukuran || lowerProps.wp || '',
        
        // 2. Mapping Kolom Irisan (Berdasarkan list atribut yang sama)
        kelurahan: lowerProps.kelurahan || null,
        kecamatan: lowerProps.kecamatan || null,
        wilayah: lowerProps.wilayah || null,
        jenis_input_data: lowerProps.jenis_input_data || null,
        jumlah_bangunan: lowerProps.jumlah_bangunan || null,
        
        luas_bangunan_oppajak: lowerProps.luas_bangunan_oppajak || null,
        hasil_lapangan: lowerProps.hasil_lapangan || null,
        tanggal_ukur: lowerProps.tanggal_ukur || null,
        nama_sts: lowerProps.nama_sts || null,
        
        // Klasifikasi JPB (Di bangunan_raw namanya KLASIFIKASI_JPB)
        klasifikasi_jpb: lowerProps.klasifikasi_jpb || lowerProps.jpb_v1_petakerja || null
      };

      // KODE "AUTO COPY SEMUA ATRIBUT" YANG BIKIN ERROR DIHAPUS DI SINI

      const { data, error } = await supabase
        .from('bangunan_raw')
        .insert([newBangunanData])
        .select()
        .single();

      if (error) throw error;

      alert("Berhasil! Poligon dan atribut tersalin ke bangunan_raw.");
      
      setSelectedFeature(data as unknown as SurveyProperties);
      setFormData(data);
      setEditMode(true); 

    } catch (error: any) {
      alert("Gagal menyalin geometri: " + error.message);
    }
  };

  // Fungsi untuk Menghapus Poligon
      const handleDeleteFeature = async () => {
      if (!selectedFeature) return;
    
      // Munculkan dialog konfirmasi sebelum menghapus
      const confirmDelete = window.confirm("⚠️ Yakin ingin menghapus poligon ini secara permanen? Tindakan ini tidak dapat dibatalkan.");
      if (!confirmDelete) return;

      try {
      const namaTabelAktif = activeTables[0];
      const pkColumn = (selectedFeature as any).id ? 'id' : (selectedFeature as any).gid ? 'gid' : 'objectid';
      const idPoligon = (selectedFeature as any)[pkColumn];

      if (!idPoligon) {
        alert("Gagal: ID poligon tidak ditemukan!");
        return;
      }

      const { error } = await supabase
        .from(namaTabelAktif)
        .delete()
        .eq(pkColumn, idPoligon);

      if (error) throw error;

      alert("Poligon berhasil dihapus!");
      setSheetOpen(false);      // Tutup panel form bawah
      setSelectedFeature(null); // Bersihkan pilihan
      
      setMapRefreshTrigger(prev => prev + 1);
      
      } catch (error: any) {
        alert("Gagal menghapus poligon: " + error.message);
      }
      };


  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !selectedFeature) {
        alert("Pilih poligon/data survei terlebih dahulu!");
        return;
      }

      setUploading(true);

      // Buat nama file unik
      const fileExt = file.name.split('.').pop();
      const fileName = `dokumentasi_${selectedFeature.id || Date.now()}_${Math.random()}.${fileExt}`;
      const filePath = `survey_photos/${fileName}`;

      // Upload ke Supabase Storage (Bucket: survey_images)
      const { error: uploadError } = await supabase.storage
        .from('survey_images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Ambil Public URL
      const { data: urlData } = supabase.storage
        .from('survey_images')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update kolom foto_pengukuran di database bangunan_raw
      const { error: updateError } = await supabase
        .from('bangunan_raw')
        .update({ foto_pengukuran: publicUrl })
        .eq('id', selectedFeature.id);

      if (updateError) throw updateError;

      // Update tampilan di layar secara langsung
      setFormData((prev: any) => ({ ...prev, foto_pengukuran: publicUrl }));
      setSelectedFeature((prev: any) => ({ ...prev, foto_pengukuran: publicUrl }));

      alert("Foto dokumentasi berhasil diunggah!");
    } catch (error: any) {
      alert("Gagal mengunggah foto: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const [kondisiValue, setKondisiValue] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false) // 1. Tambahkan variabel baru ini
  const [photoFile, setPhotoFile] = useState<File | null>(null);

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
    setActiveTables((prev) => {
      const isActive = prev.includes(id);
      
      // Jika layer sedang dimatikan...
      if (isActive) {
        // 1. Bersihkan tabel raksasa jika sedang buka tabel ini
        if (viewingTableId === id) {
          setViewingTableId(null);
        }
        
        // 2. BERSIHKAN DATA POLIGON (Ini yang memperbaiki bug form nyangkut)
        setSelectedFeature(null);
        
        // 3. Jika tidak ada layer lain yang aktif, tutup sekalian panel bawahnya
        if (prev.length === 1) {
           setSheetOpen(false);
        }
        
        return prev.filter((t) => t !== id);
      } 
      // Jika layer sedang dihidupkan
      else {
        return [...prev, id];
      }
    });
  }

  // Fungsi baru: Memuat data atribut tabel utuh saat pill hijau diklik
  const handleViewTable = async (tableId: string) => {
    setViewingTableId(tableId);
    setSelectedFeature(null); // Sembunyikan form detail poligon
    setSheetOpen(true); // Buka panel bawah
    setIsLoadingTable(true);

    try {
      // Ambil atribut langsung dari tabel (batasi 100 agar tidak berat)
      const { data, error } = await supabase.from(tableId).select('*').limit(100);
      if (error) throw error;
      setLayerTableData(data || []);
    } catch (err: any) {
      console.error("Gagal memuat tabel:", err.message);
    } finally {
      setIsLoadingTable(false);
    }
  };

  // Fungsi untuk menyimpan poligon baru hasil gambar tangan ke Supabase
  const handleFeatureCreate = async (geometry: any) => {
    try {
      const namaTabelAktif = activeTables[0];
      const cleanedGeom = stripZDimension(geometry);

      // Data awal kosong atau default untuk poligon baru
      const newData = {
        geom: cleanedGeom,
        nop_pengukuran: '',
        wp_pengukuran: '',
        jenis_input_data: 'A. PEREKAMAN DATA',
      };

      const { data, error } = await supabase
        .from(namaTabelAktif)
        .insert([newData])
        .select()
        .single();

      if (error) throw error;

      alert("Poligon baru berhasil disimpan! Silakan isi atributnya.");
      
      // Pilih data baru tersebut agar form langsung terbuka dan bisa diedit
      setSelectedFeature(data as unknown as SurveyProperties);
      setFormData(data);
      setEditMode(true);
      setSheetOpen(true);
      
      // Refresh peta agar poligon dari database langsung tampil
      setMapRefreshTrigger(prev => prev + 1);

    } catch (error: any) {
      alert("Gagal menyimpan poligon baru: " + error.message);
    }
  };

  // Fungsi klik yang sudah diperbarui (menimpa baris 152-157 Anda)
  const handleFeatureSelect = (properties: SurveyProperties) => {
    setSelectedFeature(properties)
    setKondisiValue(properties.kondisi_eksisting ?? '')
    setPhotoPreview(null)
    setViewingTableId(null) // <--- Ini yang menutup tabel raksasa saat poligon diklik
    setSheetOpen(true)
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  setPhotoFile(file) // Tambahkan baris ini
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
        onFeatureCreate={handleFeatureCreate}
        refreshTrigger={mapRefreshTrigger}
        locateTrigger={locateTrigger}
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
            onClick={() => setLocateTrigger(prev => prev + 1)}
            aria-label="Lokasi Saya"
            className="flex h-9 w-9 items-center justify-center rounded-xl transition bg-white shadow text-blue-600 hover:bg-blue-50"
          >
            <LocateFixed size={18} />
          </button>
          <button
            type="button"
            onClick={() => setIsDark(false)}
            aria-label="Mode terang"
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${!isDark ? 'bg-white shadow' : 'text-slate-400'
              }`}
          >
            <Sun size={18} className={!isDark ? 'text-amber-500' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setIsDark(true)}
            aria-label="Mode gelap"
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${isDark ? 'bg-white shadow' : 'text-slate-400'
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
              className={`flex-1 py-3 text-sm font-semibold ${panelTab === 'layers' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400'
                }`}
            >
              Layers
            </button>
            <button
              type="button"
              onClick={() => setPanelTab('basemap')}
              className={`flex-1 py-3 text-sm font-semibold ${panelTab === 'basemap' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400'
                }`}
            >
              Basemap
            </button>
          </div>

          <div className="max-h-80 space-y-3 overflow-y-auto p-4">
            {panelTab === 'layers' && (
              <>


                <div className="space-y-2 pt-2">
                  {tableTabs.map((t) => (
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
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${basemap.type === 'osm' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'
                    }`}
                >
                  OpenStreetMap
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap({ type: 'dark' })}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${basemap.type === 'dark' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'
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
        {tableTabs
          .filter((t) => activeTables.includes(t.id)) // Baris ini memastikan HANYA layer yang dicentang yang muncul
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleViewTable(t.id)} // <--- UBAH BARIS INI
              className="shrink-0 whitespace-nowrap rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:bg-emerald-700"
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
        className={`fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-3xl bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.15)] ${
          sheetOpen ? 'translate-y-0' : 'translate-y-[110%]'
        }`}
        style={{ 
          // INI YANG MEMBUATNYA BISA MEMANJANG/MEMENDEK
          height: sheetSize === 'full' ? '85vh' : '45vh',
          transition: 'height 0.4s ease-in-out, transform 0.5s cubic-bezier(0.32,0.72,0,1)'
        }}
      >
        {/* Header / Handle */}
        <div className="flex flex-col bg-white rounded-t-3xl border-b border-slate-100">
          
          {/* Tuas abu-abu yang BISA DIKLIK (Area klik sudah saya perbesar agar mudah dipencet) */}
          <button 
            type="button"
            className="flex w-full justify-center py-4 cursor-pointer hover:bg-slate-50 active:bg-slate-100 focus:outline-none"
            onClick={(e) => {
              e.preventDefault();
              setSheetSize(prev => prev === 'half' ? 'full' : 'half');
            }}
          >
            <div className="h-2 w-16 rounded-full bg-slate-300 transition-colors" />
          </button>

          <div className="flex items-center justify-between px-4 pb-3 pt-1">
            <div className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
              {activeTables.map((id) => {
                const tab = tableTabs.find((t) => t.id === id)
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
              {/* TOMBOL PENSIL (EDIT) */}
              <button
                type="button"
                aria-label="Edit"
                onClick={() => setEditMode((v) => !v)}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  editMode ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <Pencil size={14} />
              </button>
              
              {/* TOMBOL HAPUS */}
              <button
                type="button"
                aria-label="Hapus Poligon"
                onClick={handleDeleteFeature}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                title="Hapus Poligon"
              >
                <Trash2 size={14} />
              </button>

              {/* TOMBOL TUTUP (CHEVRON) */}
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
        <div className="flex flex-col gap-4 mt-4 px-4 overflow-y-auto pb-20 bg-white">
          
{/* === MODE 1: LIHAT TABEL KESELURUHAN (ARCGIS STYLE) === */}
          {viewingTableId && !selectedFeature && (
            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-slate-800 uppercase border-b pb-2">
                Tabel Atribut: {viewingTableId.replace(/_/g, ' ')}
              </h3>
              {isLoadingTable ? (
                <div className="py-4 text-center text-sm font-medium text-slate-500 animate-pulse">
                  Mengambil data dari server...
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100">
                        {layerTableData.length > 0 && 
                          Object.keys(layerTableData[0])
                            // Sembunyikan kolom geom agar tabel tidak error karena isinya terlalu panjang
                            .filter(k => k.toLowerCase() !== 'geom') 
                            .map(key => (
                            <th key={key} className="border-b border-r border-slate-200 p-2 uppercase whitespace-nowrap font-semibold text-slate-700">
                              {key.replace(/_/g, ' ')}
                            </th>
                          ))
                        }
                      </tr>
                    </thead>
                    <tbody>
                      {layerTableData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-emerald-50 transition-colors">
                          {Object.keys(row)
                            .filter(k => k.toLowerCase() !== 'geom')
                            .map(key => (
                            <td key={key} className="border-b border-r border-slate-200 p-2 whitespace-nowrap text-slate-600">
                              {row[key] !== null ? String(row[key]) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {layerTableData.length === 0 && (
                    <p className="text-sm text-slate-500 p-4 text-center">Tidak ada data di tabel ini.</p>
                  )}
                </div>
              )}
          </div>
        )}
          
          {/* HEADER FORM: NOP dan Nama WP */}
          {selectedFeature && (
            <div className="mb-2 pb-4 border-b border-slate-200">
              {/* Pastikan nama properti NOP dan NAMA_WP sesuai dengan huruf besar/kecil di database Anda */}
              
              {/* TOMBOL AKSI: COPY GEOMETRY & SIMPAN (Hanya muncul jika poligon diklik) */}
          {selectedFeature && (
            <div className="mb-4 flex flex-col gap-2">
              
              {/* Tombol Simpan Form (Hanya muncul di Mode Edit) */}
              {editMode && (
                <button
                  type="button"
                  onClick={handleSimpanData}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors"
                >
                  Simpan Perubahan
                </button>
              )}

              {/* Tombol Copy Geometri (Hanya muncul jika BUKAN dari layer bangunan_raw) */}
              {activeTables[0] !== 'bangunan_raw' && (
                <button
                  type="button"
                  onClick={handleCopyGeometry}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold py-2 px-4 rounded-lg shadow-sm transition-colors border border-emerald-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  Salin Poligon & Buat Survei Baru
                </button>
              )}
            </div>
          )}
              
              <p className="text-lg font-bold text-slate-900">
                NOP: {String((selectedFeature as any)?.nop_pengukuran || (selectedFeature as any)?.NOP || (selectedFeature as any)?.nop || '-')}
              </p>
              <p className="text-sm font-medium text-slate-600 uppercase">
                WP: {String((selectedFeature as any)?.wp_pengukuran || (selectedFeature as any)?.NAMA_WP || (selectedFeature as any)?.nama_wp || '-')}
              </p>
            </div>
          )}

          {/* DAFTAR ATRIBUT DINAMIS */}
          {selectedFeature && Object.keys(formData).map((namaKolom) => {
            const kolomKecil = namaKolom.toLowerCase();
            
            // Sembunyikan kolom sistem & header (Tambahkan kolom lain jika ingin disembunyikan)
            if (['id', 'gid', 'objectid', 'geom', 'nop', 'nama_wp_sp', 'nama_wp', 'nop_pengukuran', 'wp_pengukuran'].includes(kolomKecil)) return null;

            return (
              <div key={namaKolom} className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase">
                  {namaKolom.replace(/_/g, ' ')}
                </label>
                
                {editMode ? (
                  // LOGIKA MAPPING DROPDOWN KHUSUS BANGUNAN RAW
                  activeTables.includes('bangunan_raw') && kolomKecil === 'jenis_input_data' ? (
                    <select className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800 bg-white focus:border-blue-500 focus:outline-none" value={formData[namaKolom] || ''} onChange={(e) => handleInputChange(namaKolom, e.target.value)}>
                      <option value="">-- Pilih Jenis Input --</option>
                      {OPT_JENIS_INPUT.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : activeTables.includes('bangunan_raw') && kolomKecil === 'jenis_penggunaan_bangunan' ? (
                    <select className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800 bg-white focus:border-blue-500 focus:outline-none" value={formData[namaKolom] || ''} onChange={(e) => handleInputChange(namaKolom, e.target.value)}>
                      <option value="">-- Pilih Penggunaan --</option>
                      {OPT_PENGGUNAAN.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : activeTables.includes('bangunan_raw') && (kolomKecil === 'kondisi_pada_umumnya' || kolomKecil === 'kondisi_bangunan') ? (
                    <select className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800 bg-white focus:border-blue-500 focus:outline-none" value={formData[namaKolom] || ''} onChange={(e) => handleInputChange(namaKolom, e.target.value)}>
                      <option value="">-- Pilih Kondisi --</option>
                      {OPT_KONDISI.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : activeTables.includes('bangunan_raw') && kolomKecil === 'konstruksi' ? (
                    <select className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800 bg-white focus:border-blue-500 focus:outline-none" value={formData[namaKolom] || ''} onChange={(e) => handleInputChange(namaKolom, e.target.value)}>
                      <option value="">-- Pilih Konstruksi --</option>
                      {OPT_KONSTRUKSI.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : activeTables.includes('bangunan_raw') && kolomKecil === 'atap' ? (
                    <select className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800 bg-white focus:border-blue-500 focus:outline-none" value={formData[namaKolom] || ''} onChange={(e) => handleInputChange(namaKolom, e.target.value)}>
                      <option value="">-- Pilih Atap --</option>
                      {OPT_ATAP.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : activeTables.includes('bangunan_raw') && kolomKecil === 'lantai' ? (
                    <select className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800 bg-white focus:border-blue-500 focus:outline-none" value={formData[namaKolom] || ''} onChange={(e) => handleInputChange(namaKolom, e.target.value)}>
                      <option value="">-- Pilih Lantai --</option>
                      {OPT_LANTAI.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : activeTables.includes('bangunan_raw') && kolomKecil === 'langit_langit' ? (
                    <select className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800 bg-white focus:border-blue-500 focus:outline-none" value={formData[namaKolom] || ''} onChange={(e) => handleInputChange(namaKolom, e.target.value)}>
                      <option value="">-- Pilih Langit-Langit --</option>
                      {OPT_LANGIT.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : activeTables.includes('bangunan_raw') && ['jumlah_lantai', 'jumlah_bangunan', 'tahun_dibangun', 'tahun_direnovasi', 'daya_listrik_terpasang_watt'].includes(kolomKecil) ? (
                    <input
                      type="number"
                      className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                      value={formData[namaKolom] || ''}
                      onChange={(e) => handleInputChange(namaKolom, e.target.value)}
                    />
                  ) : (
                    // Default Input Text untuk kolom lain (teks biasa)
                    <input
                      type="text"
                      className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                      value={formData[namaKolom] || ''}
                      onChange={(e) => handleInputChange(namaKolom, e.target.value)}
                    />
                  )
                ) : (
                  <div className="text-sm font-medium text-slate-800 bg-slate-50 p-2 rounded-md break-words border border-transparent">
                    {formData[namaKolom] || '-'}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* FITUR UPLOAD FOTO & DOKUMENTASI (Hanya muncul jika poligon diklik) */}
          {selectedFeature && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm font-bold text-slate-800 mb-2">Dokumentasi Lapangan</p>
              
              {editMode ? (
                /* === TAMPILAN 1: MODE EDIT AKTIF (BISA UPLOAD/KAMERA) === */
                <>
                  {photoPreview ? (
                    <div className="mb-3 relative rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                      <img src={photoPreview} alt="Preview" className="w-full h-auto object-cover max-h-64" />
                      <button
                        type="button"
                        onClick={() => { setPhotoPreview(null); setPhotoFile(null); }}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 w-8 h-8 flex items-center justify-center text-xs font-bold shadow-md transition-colors"
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full bg-[#E3F2FD] border-2 border-dashed border-[#64B5F6] rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-100 transition-colors mb-3"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1E88E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                      <span className="text-slate-800 font-medium text-sm">Buka Kamera Ponsel</span>
                    </div>
                  )}

                  {/* Input Tersembunyi */}
                  <input type="file" accept="image/*" ref={galleryInputRef} onChange={handlePhotoChange} className="hidden" />
                  <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handlePhotoChange} className="hidden" />

                  {/* Tombol Simpan & Upload */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => alert("Fitur simpan foto ke storage akan segera diaktifkan!")} 
                      className="flex-1 bg-[#00C853] hover:bg-green-600 text-white py-2.5 px-4 text-sm font-semibold rounded-md shadow-sm transition-colors"
                    >
                      Simpan Foto
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="flex-1 bg-[#FFC107] hover:bg-yellow-500 text-white py-2.5 px-4 text-sm font-semibold rounded-md shadow-sm transition-colors"
                    >
                      Upload Dari Galeri
                    </button>
                  </div>
                </>
              ) : (
                /* === TAMPILAN 2: MODE EDIT MATI (HANYA BACA/LIHAT) === */
                <div className="w-full">
                  {photoPreview ? ( 
                    // Nanti `photoPreview` ini bisa diganti dengan URL foto dari database Supabase jika fotonya sudah tersimpan
                    <div className="rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                      <img src={photoPreview} alt="Dokumentasi" className="w-full h-auto object-cover max-h-64" />
                    </div>
                  ) : (
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-50">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span className="text-xs font-medium">Belum ada dokumentasi</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  </main>
  )
}

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Fuse from "fuse.js";
import * as QRCode from "qrcode";
import { 
  Search, ShoppingCart, ChevronRight, ChevronLeft, 
  Package, User, MapPin, CheckCircle2, XCircle, 
  Download, RefreshCw, Loader2, Plus, Minus, Trash2, Mic, MicOff
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

import { fetchCatalog, submitOrder, SpareItem, CartItem, OrderPayload, TransactionResult } from "@/lib/gas";
import { speak } from "@/lib/tts";
import { useAuth } from '@/context/AuthContext';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const formatRp = (val: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

// Komponen reusable: baris input + tombol mikrofon + indikator mendengarkan
function VoiceInputRow({
  fieldKey,
  activeVoiceField,
  onToggle,
  listeningLabel,
  children,
}: {
  fieldKey: string;
  activeVoiceField: string | null;
  onToggle: () => void;
  listeningLabel: string;
  children: React.ReactNode;
}) {
  const active = activeVoiceField === fieldKey;
  return (
    <div className="flex-none space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">{children}</div>
        <Button
          type="button"
          onClick={onToggle}
          className={`h-20 w-20 rounded-2xl flex-none shadow-md transition-all duration-200 ${
            active
              ? "bg-yellow-500 hover:bg-yellow-600 text-white scale-110 shadow-yellow-200 shadow-lg"
              : "bg-white border-2 border-gray-200 text-gray-500 hover:border-yellow-400 hover:text-yellow-600 hover:bg-yellow-100"
          }`}
          title={active ? "Klik untuk berhenti" : "Input dengan suara"}
        >
          {active ? <MicOff className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
        </Button>
      </div>
      {active && (
        <div className="flex items-center gap-3 px-2">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-1.5 bg-yellow-500 rounded-full animate-bounce"
                style={{ height: "20px", animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
          <span className="text-yellow-600 font-semibold text-lg">{listeningLabel}</span>
        </div>
      )}
    </div>
  );
}

export default function Wizard() {
  const [step, setStep] = useState(0);
  
  // Data State
  const [catalog, setCatalog] = useState<SpareItem[]>([]);
  const [fuse, setFuse] = useState<Fuse<SpareItem> | null>(null);

  // Form State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [peruntukan, setPeruntukan] = useState("");
  const [nama, setNama] = useState("");
  const [nik, setNik] = useState("");

  // Step 1: Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SpareItem[]>([]);
  // null = tidak ada yang aktif, string = nama field yang sedang didengarkan
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  
  // Step 5: Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trxResult, setTrxResult] = useState<TransactionResult | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    const standaloneMode = window.matchMedia('(display-mode: standalone)').matches || Boolean(navigatorWithStandalone.standalone);
    setIsStandalone(standaloneMode);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  // Initialize
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const data = await fetchCatalog();
        if (!mounted) return;
        setCatalog(data);
        setFuse(new Fuse(data, {
          keys: ["nama", "kode"],
          threshold: 0.3,
        }));
        setStep(1);
        speak("Selamat datang di PPIC, part apa yang Anda butuhkan?");
      } catch (err) {
        console.error("Failed to init catalog", err);
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  // Search Logic — hanya tampilkan hasil jika ada teks
  useEffect(() => {
    if (!fuse) return;
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
    } else {
      const results = fuse.search(searchQuery).map(res => res.item);
      setSearchResults(results.slice(0, 20));
    }
  }, [searchQuery, fuse]);

  // Generic voice input — bisa dipakai di field manapun
  const startVoice = useCallback((
    fieldKey: string,
    setter: (val: string) => void,
    opts?: { numeric?: boolean; append?: boolean }
  ) => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      alert("Browser Anda tidak mendukung pengenalan suara. Silakan ketik secara manual.");
      return;
    }

    // Kalau field yang sama sedang aktif → hentikan
    if (activeVoiceField === fieldKey) {
      recognitionRef.current?.stop();
      return;
    }

    // Hentikan recognition sebelumnya jika ada
    recognitionRef.current?.stop();

    const recognition: SpeechRecognition = new SpeechRecognitionAPI();
    recognition.lang = "id-ID";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setActiveVoiceField(fieldKey);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      if (opts?.numeric) transcript = transcript.replace(/\D/g, "").slice(0, 16);
      setter(transcript);
    };

    recognition.onerror = () => setActiveVoiceField(null);
    recognition.onend   = () => setActiveVoiceField(null);

    recognition.start();
  }, [activeVoiceField]);

  // Handlers
  const addToCart = (item: SpareItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.kode === item.kode);
      if (existing) {
        if (existing.qty >= item.stok) return prev; // Cannot add more than stock
        return prev.map(i => i.kode === item.kode ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
    setSearchQuery("");
  };

  const updateCartQty = (kode: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.kode !== kode) return i;
      const newQty = i.qty + delta;
      if (newQty < 1) return i;
      if (newQty > i.stok) return i;
      return { ...i, qty: newQty };
    }));
  };

  const removeFromCart = (kode: string) => {
    setCart(prev => prev.filter(i => i.kode !== kode));
  };

  const totalCartItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalCartPrice = cart.reduce((sum, item) => sum + (item.qty * item.harga), 0);

  const handleNextStep1 = () => {
    if (cart.length === 0) return;
    setStep(2);
    speak("Sebutkan atau masukkan lokasi peruntukan atau pemakaian sparepart tersebut?");
  };

  const handleNextStep2 = () => {
    if (peruntukan.trim().length === 0) return;
    setStep(3);
    speak("Siapa nama Anda?");
  };

  const handleNextStep3 = () => {
    if (nama.trim().length === 0) return;
    if (nik.length !== 6 || !/^\d+$/.test(nik)) return;
    setStep(4);
    speak("Silakan cek kembali pesanan Anda.");
  };

  const handleFocusNik = () => {
    speak("Berapa nomor N I K Anda?");
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setStep(5);
    
    const payload: OrderPayload = {
      nama,
      nik,
      peruntukan,
      items: cart,
      user: user ? {
        id: user.id,
        email: user.email,
        name: user.name,
      } : undefined,
    };

    try {
      const result = await submitOrder(payload);
      setTrxResult(result);
      if (result.status === "success" && result.trxId) {
        const qrUrl = await QRCode.toDataURL(result.trxId, { 
          width: 400, 
          margin: 2, 
          color: { dark: '#000000', light: '#FFFFFF' } 
        });
        setQrCodeDataUrl(qrUrl);
        speak("Pesanan Anda berhasil dikirim. Terima kasih!");
      } else if (result.status === "rejected") {
        speak("Transaksi ditolak. NIK tidak valid.");
      } else {
        speak("Maaf, terjadi kesalahan saat mengirim pesanan Anda.");
      }
    } catch (err) {
      setTrxResult({ status: "error", message: "Terjadi kesalahan jaringan." });
      speak("Maaf, terjadi kesalahan jaringan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setCart([]);
    setPeruntukan("");
    setNama("");
    setNik("");
    setSearchQuery("");
    setStep(1);
    setTrxResult(null);
    setQrCodeDataUrl("");
    speak("Selamat datang di PPIC, part apa yang Anda butuhkan?");
  };

  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      alert("Instalasi aplikasi hanya tersedia di browser yang mendukung PWA, seperti Chrome atau Edge.");
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setCanInstall(false);
    }

    setDeferredPrompt(null);
  };

  const downloadQR = () => {
    if (!qrCodeDataUrl) return;
    const a = document.createElement('a');
    a.href = qrCodeDataUrl;
    a.download = `Receipt-${trxResult?.trxId || 'Order'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const maskNik = (n: string) => {
    if (n.length === 6) return `${n.substring(0, 2)}**${n.substring(4, 6)}`;
    return n;
  };

  // Render Steps
  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-yellow-200 animate-ping"></div>
        <div className="relative bg-yellow-500 text-white p-6 rounded-full shadow-2xl">
          <Package className="w-16 h-16" />
        </div>
      </div>
      <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Mengambil data stok sparepart...</h2>
      <p className="text-xl text-slate-500">Mohon tunggu sebentar</p>
    </div>
  );

  const renderStep1 = () => (
    <div className="flex flex-col h-full space-y-6 animate-in slide-in-from-right-8 fade-in duration-300">
      <div className="flex-none space-y-2">
        <p className="text-xl text-gray-500">Ketik nama atau kode part yang anda butuhkan</p>
      </div>

      <VoiceInputRow
        fieldKey="search"
        activeVoiceField={activeVoiceField}
        onToggle={() => startVoice("search", setSearchQuery)}
        listeningLabel="Sedang mendengarkan — sebutkan nama sparepart..."
      >
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-8 h-8 text-gray-400 pointer-events-none" />
        <Input
          className={`w-full pl-20 pr-16 py-8 text-2xl rounded-2xl border-2 shadow-sm bg-white transition-colors ${
            activeVoiceField === "search"
              ? "border-yellow-500 focus-visible:border-yellow-600 ring-2 ring-yellow-200"
              : "border-gray-200 focus-visible:border-yellow-400"
          }`}
          placeholder={activeVoiceField === "search" ? "Sedang mendengarkan..." : "Contoh: bearing 6210 atau resibon potong"}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
        {searchQuery && activeVoiceField !== "search" && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            onClick={() => setSearchQuery("")}
          >
            <XCircle className="w-8 h-8" />
          </Button>
        )}
      </VoiceInputRow>

      {/* Hasil pencarian — hanya muncul kalau ada teks */}
      {searchQuery.trim().length > 0 && (
        <ScrollArea className="flex-grow bg-gray-50/50 rounded-2xl border border-gray-100 shadow-inner">
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {searchResults.map((item) => {
              const inCart = cart.find(i => i.kode === item.kode);
              const isOutOfStock = item.stok === 0;
              return (
                <Card
                  key={item.kode}
                  className={`overflow-hidden transition-all duration-200 border-2 rounded-3xl ${
                    isOutOfStock ? 'opacity-60 grayscale bg-white border-gray-100 shadow-sm cursor-not-allowed' :
                    inCart ? 'border-yellow-300 bg-yellow-50 shadow-2xl' : 'border-transparent hover:border-yellow-300 hover:shadow-xl cursor-pointer bg-white'
                  }`}
                  onClick={() => !isOutOfStock && addToCart(item)}
                >
                  <CardContent className="p-6 flex flex-col justify-between h-full">
                    <div className="flex justify-between items-start mb-4">
                      <Badge variant={isOutOfStock ? "secondary" : "default"} className={`text-sm px-3 py-1 ${!isOutOfStock && 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'}`}>
                        {item.kode}
                      </Badge>
                      <div className="text-right">
                        <span className="text-sm text-gray-500 font-medium">Stok</span>
                        <p className={`text-xl font-bold ${isOutOfStock ? 'text-gray-500' : 'text-gray-900'}`}>{item.stok}</p>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 leading-tight mb-2 line-clamp-2">{item.nama}</h3>
                      <p className="text-2xl font-black text-yellow-600">{formatRp(item.harga)}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {searchResults.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-500">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-2xl font-medium">Tidak ada sparepart yang cocok</p>
                <p className="text-lg mt-2">Coba kata kunci lain</p>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Placeholder saat belum ada teks & belum ada item di keranjang */}
      {searchQuery.trim().length === 0 && cart.length === 0 && (
        <div className="flex-grow flex flex-col items-center justify-center text-gray-400 space-y-4">
          <Search className="w-20 h-20 opacity-20" />
          <p className="text-2xl font-medium">Ketik atau ucapkan nama sparepart</p>
        </div>
      )}

      {/* Cart Summary Sticky Bottom */}
      {cart.length > 0 && (
        <div className="flex-none bg-white rounded-[2rem] shadow-2xl border border-yellow-100 p-6 animate-in slide-in-from-bottom-8">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <div className="bg-yellow-50 p-3 rounded-full text-yellow-700">
                <ShoppingCart className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">List Permintaan</h3>
                <p className="text-gray-500 font-medium">{totalCartItems} Item terpilih</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-gray-500 font-medium mb-1">Total Estimasi</p>
              <p className="text-3xl font-black text-yellow-600">{formatRp(totalCartPrice)}</p>
            </div>
          </div>
          
          <div className="space-y-3 mb-6 max-h-48 overflow-y-auto pr-2">
            {cart.map((item) => (
              <div key={item.kode} className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex-1 pr-4">
                  <p className="font-bold text-gray-900 text-lg line-clamp-1">{item.nama}</p>
                  <p className="text-yellow-600 font-bold">{formatRp(item.harga)}</p>
                </div>
                <div className="flex items-center space-x-4 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-gray-500 hover:text-yellow-700 hover:bg-yellow-100" onClick={() => item.qty === 1 ? removeFromCart(item.kode) : updateCartQty(item.kode, -1)}>
                    {item.qty === 1 ? <Trash2 className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
                  </Button>
                  <span className="text-xl font-bold w-8 text-center">{item.qty}</span>
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-gray-500 hover:text-yellow-600 hover:bg-yellow-100" onClick={() => updateCartQty(item.kode, 1)} disabled={item.qty >= item.stok}>
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex space-x-4">
            {/* Tombol ini sengaja disembunyikan karena fitur tambah item lain belum diperlukan di alur saat ini. */}
            <div className="hidden">
              <Button 
                variant="outline" 
                className="flex-1 py-8 text-xl rounded-xl border-2 border-yellow-200 text-yellow-700 hover:bg-yellow-50 font-bold"
                onClick={() => {
                  setSearchQuery("");
                  speak("Ada lagi yang dibutuhkan?");
                }}
              >
                Tambah Item Lain
              </Button>
            </div>
            <Button 
              className="flex-1 py-8 text-xl rounded-xl shadow-lg hover:shadow-xl transition-all font-bold group"
              onClick={handleNextStep1}
            >
              Lanjut proses
              <ChevronRight className="ml-2 w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-4xl mx-auto space-y-12 animate-in slide-in-from-right-8 fade-in duration-300">
      <div className="text-center space-y-4">
        <div className="mx-auto bg-yellow-50 w-24 h-24 rounded-full flex items-center justify-center text-yellow-700 mb-6">
          <MapPin className="w-12 h-12" />
        </div>
        <h2 className="text-4xl font-bold text-gray-900 tracking-tight">Lokasi Penggunaan</h2>
        <p className="text-2xl text-gray-500">Sebutkan area pemakaian sparepart ini.</p>
        <VoiceInputRow
          fieldKey="peruntukan"
          activeVoiceField={activeVoiceField}
          onToggle={() => startVoice("peruntukan", setPeruntukan)}
          listeningLabel="Sedang mendengarkan — sebutkan peruntukan..."
        >
          <Input
            className={`w-full text-center text-3xl py-10 rounded-2xl border-2 shadow-sm transition-colors ${
              activeVoiceField === "peruntukan"
                ? "border-yellow-500 ring-2 ring-yellow-200"
                : "border-gray-200 focus-visible:border-yellow-400"
            }`}
            placeholder={activeVoiceField === "peruntukan" ? "Sedang mendengarkan..." : "Contoh: roncuzzi, packing 1kg atau Mill AB"}
            value={peruntukan}
            onChange={(e) => setPeruntukan(e.target.value)}
            autoFocus
          />
        </VoiceInputRow>
        <div className="flex space-x-4">
          <Button variant="outline" className="py-8 px-8 text-xl rounded-xl border-2" onClick={() => setStep(1)}>
            <ChevronLeft className="mr-2 w-6 h-6" /> Kembali
          </Button>
          <Button
            className="flex-1 py-8 text-2xl rounded-xl shadow-lg hover:shadow-xl transition-all font-bold"
            disabled={peruntukan.trim().length === 0}
            onClick={handleNextStep2}
          >
            Lanjut
            <ChevronRight className="ml-2 w-8 h-8" />
          </Button>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-4xl mx-auto space-y-12 animate-in slide-in-from-right-8 fade-in duration-300">
      <div className="text-center space-y-4">
        <div className="mx-auto bg-yellow-50 w-24 h-24 rounded-full flex items-center justify-center text-yellow-700 mb-6">
          <User className="w-12 h-12" />
        </div>
        <h2 className="text-4xl font-bold text-gray-900 tracking-tight">Identitas Pemesan</h2>
      </div>

      <div className="w-full space-y-8 bg-white p-6 sm:p-8 lg:p-10 rounded-[2rem] shadow-2xl border border-yellow-100">
        <div className="space-y-2">
          <label className="text-xl font-bold text-gray-700 ml-2">Nama Lengkap</label>
          <VoiceInputRow
            fieldKey="nama"
            activeVoiceField={activeVoiceField}
            onToggle={() => startVoice("nama", setNama)}
            listeningLabel="Sedang mendengarkan — sebutkan nama Anda..."
          >
            <Input
              className={`w-full text-2xl py-8 rounded-xl border-2 shadow-sm bg-gray-50 transition-colors ${
                activeVoiceField === "nama"
                  ? "border-yellow-500 ring-2 ring-yellow-200"
                  : "border-gray-200 focus-visible:border-yellow-400"
              }`}
              placeholder={activeVoiceField === "nama" ? "Sedang mendengarkan..." : "Masukkan nama Anda..."}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              autoFocus
            />
          </VoiceInputRow>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-end ml-2">
            <label className="text-xl font-bold text-gray-700">Nomor Induk Karyawan (NIK)</label>
            <span className={`text-sm font-bold ${nik.length === 6 ? 'text-green-500' : 'text-gray-400'}`}>
              {nik.length}/6 Digit
            </span>
          </div>
          <Input 
            className={`w-full text-3xl tracking-widest py-8 rounded-xl border-2 shadow-sm bg-gray-50 ${
              nik.length > 0 && nik.length !== 6 ? 'border-yellow-300 focus-visible:border-yellow-500 text-yellow-700' : 
              nik.length === 6 ? 'border-green-400 focus-visible:border-green-500 text-green-700' : 
              'border-gray-200 focus-visible:border-yellow-400'
            }`}
            placeholder="6 Digit Angka"
            value={nik}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              if (val.length <= 6) setNik(val);
            }}
            onFocus={handleFocusNik}
            inputMode="numeric"
            maxLength={6}
          />
          {nik.length > 0 && nik.length !== 6 && (
            <p className="text-yellow-700 font-medium ml-2">NIK harus tepat 6 digit angka.</p>
          )}
        </div>

        <div className="pt-6 flex flex-col sm:flex-row gap-4">
          <Button variant="outline" className="w-full sm:w-auto py-8 px-8 text-xl rounded-2xl border-2 border-yellow-200 text-yellow-700 hover:bg-yellow-50 hover:border-yellow-300 font-bold" onClick={() => setStep(2)}>
            <ChevronLeft className="mr-2 w-6 h-6" /> Kembali
          </Button>
          <Button 
            className="w-full sm:flex-1 py-8 text-2xl rounded-2xl bg-gradient-to-r from-yellow-500 to-amber-500 text-white shadow-2xl hover:shadow-3xl transition-all font-bold"
            disabled={nama.trim().length === 0 || nik.length !== 6}
            onClick={handleNextStep3}
          >
            Lanjut ke Konfirmasi
            <ChevronRight className="ml-2 w-8 h-8" />
          </Button>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="flex flex-col min-h-[60vh] max-w-5xl mx-auto space-y-8 animate-in slide-in-from-right-8 fade-in duration-300 py-8">
      <div className="text-center space-y-4 mb-4">
        <h2 className="text-4xl font-bold text-gray-900 tracking-tight">Konfirmasi Pesanan</h2>
        <p className="text-2xl text-gray-500">Silakan cek kembali detail pesanan Anda sebelum dikirim.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <Card className="border-2 border-yellow-100 shadow-2xl rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-yellow-50 border-b border-yellow-100 pb-4">
              <CardTitle className="text-xl flex items-center"><User className="mr-2 w-6 h-6 text-yellow-700" /> Data Pemesan</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div>
                <p className="text-sm text-gray-500 font-medium mb-1">Nama Lengkap</p>
                <p className="text-2xl font-bold text-gray-900">{nama}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium mb-1">NIK</p>
                <p className="text-2xl font-bold tracking-wider text-gray-900">{maskNik(nik)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-yellow-100 shadow-2xl rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-yellow-50 border-b border-yellow-100 pb-4">
              <CardTitle className="text-xl flex items-center"><MapPin className="mr-2 w-6 h-6 text-yellow-700" /> Peruntukan</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold text-gray-900 leading-snug">{peruntukan}</p>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card className="border-2 border-yellow-100 shadow-2xl h-full flex flex-col rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-yellow-50 border-b border-yellow-100 pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl flex items-center text-yellow-700"><Package className="mr-2 w-6 h-6" /> Daftar Item ({totalCartItems})</CardTitle>
                <span className="text-xl font-black text-yellow-600">{formatRp(totalCartPrice)}</span>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-grow">
              <ScrollArea className="h-[400px]">
                <div className="divide-y divide-gray-100">
                  {cart.map((item) => (
                    <div key={item.kode} className="p-6 hover:bg-gray-50 flex items-center justify-between">
                      <div className="flex-1 pr-4">
                        <Badge variant="outline" className="mb-2 bg-white text-xs">{item.kode}</Badge>
                        <p className="font-bold text-xl text-gray-900 leading-tight mb-1">{item.nama}</p>
                        <p className="text-gray-500 font-medium">{formatRp(item.harga)} × {item.qty}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-gray-900">{formatRp(item.harga * item.qty)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 pt-6">
        <Button 
          variant="outline" 
          className="w-full sm:flex-1 py-10 text-2xl rounded-2xl border-2 border-yellow-200 text-yellow-700 hover:bg-yellow-50 hover:text-yellow-800 transition-colors font-bold"
          onClick={() => setStep(1)}
        >
          <XCircle className="mr-3 w-8 h-8" />
          Ubah Pesanan
        </Button>
        <Button 
          className="w-full sm:flex-[2] py-10 text-2xl sm:text-3xl rounded-2xl bg-gradient-to-r from-yellow-500 to-amber-500 text-white shadow-2xl hover:shadow-3xl transition-all font-black"
          onClick={handleSubmit}
        >
          <CheckCircle2 className="mr-3 w-10 h-10" />
          Pesanan Sekarang
        </Button>
      </div>
    </div>
  );

  const renderStep5 = () => {
    if (isSubmitting) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in duration-500">
          <Loader2 className="w-24 h-24 text-yellow-600 animate-spin" />
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Memproses Pesanan Anda...</h2>
          <p className="text-xl text-gray-500">Mohon tunggu sebentar, sedang menghubungi server.</p>
        </div>
      );
    }

    if (trxResult?.status === "rejected") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto space-y-8 animate-in zoom-in-95 duration-500">
          <div className="bg-yellow-100 p-8 rounded-full text-yellow-600 mb-4">
            <XCircle className="w-24 h-24" />
          </div>
          <h2 className="text-4xl font-bold text-gray-900 tracking-tight text-center">Transaksi Ditolak</h2>
          <p className="text-2xl text-gray-500 text-center">{trxResult.message || "Transaksi ditolak, NIK tidak valid."}</p>
          <Button className="py-8 px-12 text-2xl rounded-2xl mt-8 bg-white text-yellow-700 border border-yellow-200 shadow-lg hover:bg-yellow-50 transition-all font-bold" onClick={() => setStep(3)}>
            <RefreshCw className="mr-3 w-6 h-6" /> Periksa Ulang NIK
          </Button>
        </div>
      );
    }
    if (trxResult?.status === "error") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto space-y-8 animate-in zoom-in-95 duration-500">
          <div className="bg-yellow-100 p-8 rounded-full text-yellow-700 mb-4">
            <XCircle className="w-24 h-24" />
          </div>
          <h2 className="text-4xl font-bold text-gray-900 tracking-tight text-center">Pesanan Gagal</h2>
          <p className="text-2xl text-gray-500 text-center">{trxResult.message || "Terjadi kesalahan yang tidak diketahui."}</p>
          <Button className="py-8 px-12 text-2xl rounded-2xl mt-8 bg-gradient-to-r from-yellow-500 to-amber-500 text-white shadow-2xl hover:shadow-3xl transition-all font-bold" onClick={() => setStep(4)}>
            <RefreshCw className="mr-3 w-6 h-6" /> Coba Lagi
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] max-w-4xl mx-auto space-y-10 animate-in zoom-in-95 duration-700">
        <div className="text-center space-y-4">
          <div className="mx-auto bg-green-100 w-24 h-24 rounded-full flex items-center justify-center text-green-600 mb-6">
            <CheckCircle2 className="w-16 h-16" />
          </div>
          <h2 className="text-5xl font-black text-gray-900 tracking-tight">Pesanan Berhasil!</h2>
          <p className="text-2xl text-gray-500">Tunjukkan kode QR ini ke petugas untuk proses pengambilan barang.</p>
        </div>

        <Card className="border-4 border-yellow-200 shadow-2xl bg-white w-full max-w-md overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-4 bg-yellow-500"></div>
          <CardContent className="pt-12 pb-8 px-8 flex flex-col items-center space-y-6">
            <div className="bg-gray-50 px-6 py-3 rounded-full border border-gray-200">
              <p className="text-gray-500 font-medium uppercase tracking-widest text-sm mb-1 text-center">ID Transaksi</p>
              <p className="text-2xl font-black text-gray-900">{trxResult?.trxId}</p>
            </div>
            
            {qrCodeDataUrl ? (
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <img src={qrCodeDataUrl} alt="QR Code" className="w-64 h-64 object-contain" />
              </div>
            ) : (
              <div className="w-64 h-64 bg-gray-100 flex items-center justify-center rounded-xl animate-pulse">
                <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
              </div>
            )}

            <div className="w-full pt-4 border-t border-dashed border-gray-200 text-center space-y-2">
              <p className="text-lg font-bold text-gray-900">{nama}</p>
              <p className="text-gray-500">{totalCartItems} Item • <span className="font-bold text-yellow-600">{formatRp(totalCartPrice)}</span></p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl pt-4">
          <Button 
            variant="outline" 
            className="w-full sm:flex-1 py-8 text-xl rounded-2xl border-2 border-yellow-200 text-yellow-700 hover:bg-yellow-50 hover:text-yellow-900 font-bold"
            onClick={downloadQR}
          >
            <Download className="mr-3 w-6 h-6" />
            Simpan QR Code
          </Button>
          <Button 
            className="w-full sm:flex-1 py-8 text-xl rounded-2xl bg-white text-yellow-700 border border-yellow-200 shadow-lg hover:bg-yellow-50 transition-all font-bold"
            onClick={handleReset}
          >
            <RefreshCw className="mr-3 w-6 h-6" />
            Mulai Pesanan Baru
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-[#FFFBEB] flex flex-col font-sans selection:bg-yellow-400 selection:text-white">
      {/* Header */}
      <header className="bg-yellow-400 border-b border-yellow-500 shadow-sm shadow-yellow-300 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 leading-tight">PPIC</h1>
              <p className="text-sm sm:text-base text-slate-700 mt-1">Supply Chain</p>
            </div>
            {!isStandalone && (
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-2 border-slate-900/20 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-yellow-50"
                onClick={handleInstallApp}
              >
                <Download className="mr-2 h-4 w-4" />
                install App
              </Button>
            )}
          </div>
          
          {step > 0 && step < 5 && (
            <div className="flex items-center justify-center sm:justify-end flex-wrap gap-2 sm:gap-3">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-sm sm:text-lg transition-all duration-300 ${
                    step === s ? 'bg-yellow-500 text-white shadow-md scale-110' : 
                    step > s ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {step > s ? <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" /> : s}
                  </div>
                  {s < 4 && (
                    <div className={`w-8 h-1 sm:w-10 rounded-full mx-2 transition-colors duration-300 ${
                      step > s ? 'bg-yellow-200' : 'bg-gray-100'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8 flex flex-col">
        {step === 0 && renderLoading()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </main>
    </div>
  );
}

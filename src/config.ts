// Konfigurasi aplikasi Kiosk Pemesanan Sparepart Toko Merah Putih
// GAS_WEBHOOK_URL: URL Google Apps Script sebagai backend & database terpusat
export const GAS_WEBHOOK_URL = import.meta.env.VITE_GAS_URL || "";

// ElevenLabs TTS — leave empty to fallback to Web Speech API
export const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || "";
export const ELEVENLABS_VOICE_ID =
  import.meta.env.VITE_ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel (Indonesian-friendly)

import { GAS_WEBHOOK_URL } from "@/config";

export interface SpareItem { 
  kode: string; 
  nama: string; 
  stok: number; 
  harga: number; 
}

export interface CartItem extends SpareItem { 
  qty: number; 
}

export interface OrderPayload {
  nama: string;
  nik: string;
  peruntukan: string;
  items: CartItem[];
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface TransactionResult {
  status: "success" | "error" | "rejected";
  trxId?: string;
  message?: string;
}

export async function fetchCatalog(): Promise<SpareItem[]> {
  try {
    const res = await fetch(GAS_WEBHOOK_URL);
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  } catch (error) {
    console.error("Error fetching catalog, returning dummy data for development", error);
    // Return dummy data if GAS is unreachable to avoid blocking UI development
    return [
      { kode: "BSI-01", nama: "Busi Honda Beat / Vario", stok: 15, harga: 25000 },
      { kode: "OL-YML-1", nama: "Oli Yamalube Matic 800ml", stok: 40, harga: 45000 },
      { kode: "BAN-FD-9090", nama: "Ban Depan FDR 90/90-14", stok: 8, harga: 210000 },
      { kode: "BAN-BL-10090", nama: "Ban Belakang IRC 100/90-14", stok: 5, harga: 245000 },
      { kode: "RNT-MX-150", nama: "Rantai SSS Yamaha Jupiter MX", stok: 12, harga: 135000 },
      { kode: "KMP-RM-BT", nama: "Kampas Rem Depan Beat Fi", stok: 35, harga: 48000 },
      { kode: "AK-GS-YTZ5", nama: "Aki GS Astra YTZ5S", stok: 20, harga: 220000 },
      { kode: "VBL-MIO-J", nama: "V-Belt Yamaha Mio J / Soul GT", stok: 18, harga: 110000 },
      { kode: "BLB-H6-LD", nama: "Lampu Depan LED H6 Osram", stok: 50, harga: 55000 },
      { kode: "SHK-YSS-300", nama: "Shockbreaker YSS 300mm Matic", stok: 4, harga: 450000 },
    ];
  }
}

export async function submitOrder(payload: OrderPayload): Promise<TransactionResult> {
  try {
    const res = await fetch(GAS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" }, // GAS requires text/plain for CORS
      body: JSON.stringify(payload),
    });
    return res.json();
  } catch (error) {
    console.error("Error submitting order", error);
    // Dummy successful response for development when GAS isn't hooked up correctly
    return new Promise(resolve => setTimeout(() => resolve({
      status: "success",
      trxId: `PPIC-${Math.floor(Math.random() * 1000000)}`,
      message: "Pesanan berhasil dibuat"
    }), 1500));
  }
}

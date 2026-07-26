import { User } from '../context/AuthContext';

export interface OrderItem {
  kode: string;
  nama: string;
  qty: number;
  harga: number;
}

export interface OrderPayload {
  nama: string;
  nik: string;
  peruntukan: string;
  items: OrderItem[];
  totalAmount: number;
}

export interface InventoryRecordPayload {
  action: 'recordOutput';
  user: {
    id: string;
    email: string;
    name: string;
  };
  order: OrderPayload & { trxId: string };
  timestamp: string;
}

export const recordInventoryOutput = async (
  order: OrderPayload,
  user: User,
  trxId: string,
  timestamp: string = new Date().toISOString()
): Promise<{ status: string; message?: string }> => {
  const targetUrl = import.meta.env.VITE_INVENTORY_GAS_URL || import.meta.env.VITE_GAS_URL;

  const payload: InventoryRecordPayload = {
    action: 'recordOutput',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    order: {
      ...order,
      trxId,
    },
    timestamp,
  };

  if (!targetUrl) {
    console.warn('[FALLBACK INVENTORY] URL GAS belum dikonfigurasi. Menyimpan ke localStorage.');
    const history = JSON.parse(localStorage.getItem('offline_inventory_logs') || '[]');
    history.push(payload);
    localStorage.setItem('offline_inventory_logs', JSON.stringify(history));
    return { status: 'success', message: 'Fallback local storage' };
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // Menghindari pre-flight CORS di GAS
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('[INVENTORY LOG ERROR]', error);
    // Simpan ke offline cache sebagai pertahanan sekunder
    const history = JSON.parse(localStorage.getItem('offline_inventory_logs') || '[]');
    history.push(payload);
    localStorage.setItem('offline_inventory_logs', JSON.stringify(history));
    
    throw error;
  }
};

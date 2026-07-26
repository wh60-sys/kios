# Kiosk Pemesanan Sparepart — Toko Merah Putih

Aplikasi web kiosk interaktif berbentuk conversational wizard untuk pemesanan sparepart.

## Konfigurasi

Edit `src/config.ts` untuk mengubah:

| Variabel | Deskripsi |
|---|---|
| `GAS_WEBHOOK_URL` | URL Google Apps Script Web App |
| `ELEVENLABS_API_KEY` | API Key ElevenLabs (kosongkan untuk pakai Web Speech API) |
| `ELEVENLABS_VOICE_ID` | Voice ID ElevenLabs (default: Rachel) |

Atau atur via environment variable dengan prefix `VITE_`:
- `VITE_GAS_URL`
- `VITE_ELEVENLABS_API_KEY`
- `VITE_ELEVENLABS_VOICE_ID`

Jika Anda membutuhkan endpoint inventory terpisah, tambahkan juga:
- `VITE_INVENTORY_GAS_URL` (opsional, fallback ke `VITE_GAS_URL` jika tidak diset)

## Cara Deploy Google Apps Script

1. Buka Google Sheet Anda: https://docs.google.com/spreadsheets/d/1qVm95IBWlBV4EyJpy6vIXT7nbkZJqdWL6jym9513sVE
2. Klik **Extensions → Apps Script**
3. Salin kode di bawah ke editor, lalu klik **Deploy → New deployment**
4. Pilih type: **Web app**
5. Execute as: **Me**
6. Who has access: **Anyone** *(penting untuk CORS)*
7. Klik **Deploy** dan salin URL-nya ke `GAS_WEBHOOK_URL`

### Kode Google Apps Script (doGet + doPost)

```javascript
function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master_Stok");
  const data = sheet.getDataRange().getValues();
  const items = [];

  for (let i = 1; i < data.length; i++) {
    items.push({
      kode: data[i][0],
      nama: data[i][1],
      stok: Number(data[i][2]),
      harga: Number(data[i][3]),
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify(items))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Laporan_Permintaan");

    const now = new Date();
    const timestamp = Utilities.formatDate(now, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
    const trxId = data.trxId || "PPIC-" + Math.floor(100000 + Math.random() * 900000);

    const userId = data.user?.id || "";
    const userEmail = data.user?.email || "";
    const userName = data.user?.name || "";
    const nama = data.nama || "";
    const nik = data.nik || "";
    const peruntukan = data.peruntukan || "";

    const items = Array.isArray(data.items) ? data.items : [];
    const totalHarga = items.reduce(
      (sum, item) => sum + (Number(item.qty || 0) * Number(item.harga || 0)),
      0
    );

    const rows = items.length
      ? items.map((item) => [
          timestamp,
          userId,
          userEmail,
          userName,
          nama,
          nik,
          peruntukan,
          item.kode || "",
          item.nama || "",
          Number(item.qty || 0),
          Number(item.harga || 0),
          Number(item.qty || 0) * Number(item.harga || 0),
          totalHarga,
          trxId,
          "Pending",
        ])
      : [
          [
            timestamp,
            userId,
            userEmail,
            userName,
            nama,
            nik,
            peruntukan,
            "",
            "",
            0,
            0,
            0,
            0,
            trxId,
            "Pending",
          ],
        ];

    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);

    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", trxId }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(
        JSON.stringify({ status: "error", message: err.message || err.toString() })
      )
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

> **Catatan CORS:** Google Apps Script hanya mengizinkan cross-origin request dari HTTPS.
> Saat development (`http://localhost`), CORS akan diblokir dan aplikasi akan tampil dengan data dummy.
> Setelah di-deploy ke Replit (HTTPS), koneksi ke GAS akan berjalan normal.

## Struktur Tab Google Sheet

### Tab `Master_Stok`
| Kolom A | Kolom B | Kolom C | Kolom D |
|---|---|---|---|
| kode | nama | stok | harga |
| BSI-01 | Busi Honda Beat | 15 | 25000 |

### Tab `Laporan_Permintaan`
| Timestamp | User ID | User Email | User Name | Nama | NIK | Peruntukan | Kode Item | Nama Item | Qty | Harga | Subtotal | Total Harga | PPIC ID | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Alur Aplikasi

1. **Loading** — Fetch katalog dari Google Sheets
2. **Step 1** — Cari & pilih sparepart dengan autocomplete (Fuse.js)
3. **Step 2** — Input peruntukan / lokasi pemakaian
4. **Step 3** — Input nama & NIK (6 digit)
5. **Step 4** — Konfirmasi ringkasan pesanan
6. **Step 5** — Submit ke GAS + tampil QR Code bukti transaksi

## Text-to-Speech

- Jika `ELEVENLABS_API_KEY` diisi → menggunakan ElevenLabs (suara natural Bahasa Indonesia)
- Jika kosong → fallback otomatis ke Web Speech API bawaan browser (`id-ID`)

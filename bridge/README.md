# Bridge MT5 — Panduan Setup

Script ini berjalan di **VPS Windows yang sama dengan terminal MT5 kamu**
(termasuk terminal yang dipakai copier). Ia membaca data akun dari terminal
dan mengirimkannya ke web app secara berkala.

## Cara kerja

```
Terminal MT5 (VPS)  ──►  mt5_bridge.py  ──►  Web App (POST /api/bridge/sync)
     copier jalan              │                    memakai token akun
     (tidak diganggu)          └─ tiap 30 detik
```

Bridge **tidak mengganggu copier** — dalam mode `attach_existing: true` ia
hanya "menempel" ke terminal yang sudah berjalan, tidak login ulang,
tidak menutup terminal, dan tidak memindahkan akun.

## Persyaratan

- Windows + terminal MT5 terpasang dan sedang berjalan
- Python 3.8+ (unduh dari https://www.python.org/downloads/ — centang
  **"Add Python to PATH"** saat install)
- Akses HTTP dari VPS ke web app (jika web app di server lain, pastikan
  URL-nya bisa diakses dari VPS; jika perlu, gunakan HTTPS + reverse proxy)

## Langkah setup

### 1. Install dependensi

Buka Command Prompt / PowerShell di folder `bridge`, lalu:

```bat
pip install -r requirements.txt
```

### 2. Salin config

```bat
copy config.example.json config.json
```

Lalu edit `config.json`:

| Field              | Isi                                                                 |
| ------------------ | ------------------------------------------------------------------- |
| `app_url`          | URL web app. **Web di VPS Linux + MT5 di VPS Windows = pakai domain publik**, mis. `https://monitor.domainkamu.com` — *jangan* `localhost` (itu menunjuk ke mesin bridge sendiri). `http://localhost:3000` hanya untuk uji lokal bila web app & bridge di mesin yang sama |
| `interval`         | Detik antar sinkronisasi (default `30`)                             |
| `history_days`     | Berapa hari ke belakang deal history diambil saat pertama jalan     |
| `terminal_path`    | Opsional. Path `terminal64.exe`, mis. `C:\Program Files\ICMarkets\terminal64.exe` |
| `accounts[].login` | Nomor login akun MT5                                                |
| `accounts[].token` | **Token dari halaman Akun di web app** (tombol "Salin")             |
| `attach_existing`  | `true` = pakai terminal yang sedang berjalan (default, aman untuk copier). `false` = bridge login sendiri memakai password investor |
| `accounts[].password` / `server` | Wajib diisi **hanya jika** `attach_existing: false` |

> Catatan `attach_existing: true`: bridge memakai akun yang sedang aktif
> di terminal. Pastikan terminal sedang login ke akun yang mau dimonitor.
> Jika `login` diisi, bridge memverifikasi kecocokan dan menolak bila beda.

### 3. Jalankan

```bat
python mt5_bridge.py
```

Contoh output yang sehat:

```
[12:00:00] Sinkronisasi: Akun Utama
  [OK] 3 deal baru, 1 posisi terbuka.
  [OK] Server: deals=3 ditambah, posisi=1, balance=1234.56 USD
```

### 4. (Opsional) Jalankan sebagai layanan agar tetap hidup

Pakai **NSSM** (https://nssm.cc) supaya bridge jalan otomatis saat VPS restart:

```bat
nssm install FreebuffBridge "C:\path\to\python.exe" "D:\path\to\bridge\mt5_bridge.py"
nssm set FreebuffBridge AppDirectory "D:\path\to\bridge"
nssm start FreebuffBridge
```

## Troubleshooting

| Masalah                            | Solusi                                                              |
| ---------------------------------- | ------------------------------------------------------------------- |
| `Paket MetaTrader5 tidak terpasang`| `pip install -r requirements.txt` — pastikan Python terdaftar di PATH |
| `Gagal attach terminal`            | Buka terminal MT5 dulu di VPS, baru jalankan bridge                 |
| `Terminal aktif login X, bukan Y`  | Login terminal ke akun yang dimonitor, atau set `attach_existing: false` + isi password/server |
| `Token ditolak server`             | Salin ulang token dari halaman Akun di web app                      |
| `Gagal kirim`                      | Cek `app_url`, firewall VPS, dan apakah web app sedang jalan        |

## Keamanan

- Password investor (jika dipakai) disimpan di `config.json` VPS kamu
  dalam keadaan **plaintext** — batasi akses file itu. Di sisi web app,
  password dienkripsi AES-256-GCM dengan `ENCRYPTION_KEY` dari `.env`.
- Token bridge hanya mengizinkan **menulis data sinkron** ke akun itu,
  bukan mengubah akun atau membaca data akun lain.
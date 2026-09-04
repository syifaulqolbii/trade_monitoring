# Panduan Deploy ke VPS (Docker + Nginx + Certbot)

Asumsi: VPS Linux kamu sudah terpasang **Docker**, **Nginx**, dan **Git**,
serta punya domain (mis. `monitor.domainkamu.com`) yang DNS-nya sudah
diarahkan ke IP VPS.

Arsitektur hasil deploy:

```
Internet ──► Nginx :443 (HTTPS via Certbot) ──► Docker :127.0.0.1:3000 ──► SQLite (volume)
                                                                             ▲
VPS Windows (MT5 + bridge) ──► POST https://monitor.domainkamu.com/api/bridge/sync
```

---

## 1. Ambil kode & siapkan rahasia

```bash
cd /opt
git clone <URL_REPO> freebuff-monitor
cd freebuff-monitor
cp .env.example .env
```

Isi `.env`:

```bash
# 1) Buat dua secret (jalankan di terminal lokal atau VPS):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2) Lalu edit .env:
#    SESSION_SECRET   = hasil node pertama
#    ENCRYPTION_KEY   = hasil node kedua
#    AUTH_USERNAME    = username login (mis. admin)
#    AUTH_PASSWORD    = password kuat — atau bcrypt hash ($2...$) dari:
#                       node -e "console.log(require('bcryptjs').hashSync('password-ku', 10))"
```

> **PENTING**: `DATABASE_URL` di `.env` tidak dipakai saat container
> (compose memakai `file:/app/data/dev.db`). Biarkan apa adanya untuk dev lokal.

## 2. Build & jalankan

> **Port bentrok?** Bila port 3000 di VPS sudah dipakai container lain
> (cek: `docker ps`), tambahkan `APP_PORT=3100` di `.env` — port host
> otomatis berpindah. Contoh di panduan ini memakai `APP_PORT=3100`.

```bash
docker compose up -d --build
```

Cek:

```bash
docker compose ps            # status harus "Up (healthy)"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/login   # → 200
                              # (ganti 3100 dengan APP_PORT kamu)
docker compose logs -f web   # lihat log bila ada masalah
```

App jalan di `127.0.0.1:<APP_PORT>` (tidak terbuka ke publik — hanya bisa
diakses lewat nginx). Pastikan `proxy_pass` di nginx memakai port yang sama
(`nginx.conf.example` contohnya memakai 3100).

## 3. Nginx reverse proxy

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/freebuff-monitor
sudo nano /etc/nginx/sites-available/freebuff-monitor   # ganti server_name → domain kamu
sudo ln -s /etc/nginx/sites-available/freebuff-monitor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Coba: buka `http://monitor.domainkamu.com` — harus muncul halaman login.

## 4. HTTPS dengan Certbot

```bash
sudo apt install certbot python3-certbot-nginx   # bila belum ada
sudo certbot --nginx -d monitor.domainkamu.com
```

Certbot otomatis: membuat sertifikat, mengubah konfigurasi nginx jadi
HTTPS + redirect, dan memasang auto-renew (timer `certbot.timer`).

Verifikasi: buka `https://monitor.domainkamu.com` → login berhasil.

## 5. Hubungkan bridge MT5 di VPS Windows

Di VPS Windows (tempat terminal MT5 + copier):

1. Buka web app → halaman **Akun** → tambah akun MT5 kamu.
2. Salin **token** akun.
3. Edit `bridge/config.json`:
   - `app_url` → `https://monitor.domainkamu.com`
   - `accounts[].login` → login MT5 kamu
   - `accounts[].token` → token yang disalin
4. Jalankan `python mt5_bridge.py` (lihat `bridge/README.md` untuk detail
   & cara menjadikannya service dengan NSSM).

Setelah siklus pertama, dashboard terisi.

## 6. Update aplikasi (versi baru)

```bash
cd /opt/freebuff-monitor
git pull
docker compose up -d --build
```

Data aman — tersimpan di volume `freebuff-data`, tidak hilang saat update.

> Bila ada perubahan **skema database** (file `prisma/schema.prisma`),
> jalankan sekali: `docker compose exec web npx prisma db push`

## 7. Backup database (disarankan)

Data ada di volume Docker:

```bash
# Cari lokasi file:
docker volume inspect freebuff-monitor_freebuff-data   # lihat "Mountpoint"

# Contoh backup + cron harian:
mkdir -p /root/backups
docker run --rm -v freebuff-monitor_freebuff-data:/data -v /root/backups:/backup \
  alpine cp /data/dev.db /backup/dev-$(date +\%F).db

crontab -e   # tambah baris (jalan tiap 03:00):
# 0 3 * * * docker run --rm -v freebuff-monitor_freebuff-data:/data -v /root/backups:/backup alpine cp /data/dev.db /backup/dev-$(date +\%F).db
```

Simpan backup di tempat lain (rsync ke storage eksternal) untuk keamanan ekstra.

## 8. Troubleshooting

| Masalah                              | Solusi                                                        |
| ------------------------------------ | ------------------------------------------------------------- |
| `docker compose ps` tidak healthy    | `docker compose logs web`; biasanya secret belum diisi         |
| Halaman blank / 502 dari nginx       | Cek `docker compose ps`; pastikan app jalan di 127.0.0.1:3000  |
| Sync bridge gagal (401)              | Token di `bridge/config.json` beda dengan token di halaman Akun |
| Payload besar ditolak (413)          | `client_max_body_size 25m;` sudah ada di nginx conf            |
| Domain tidak kebuka                  | Cek DNS (A record → IP VPS) dan firewall (buka 80/443)         |
| Port 3000 terbuka ke publik          | Jangan ubah binding di compose — biarkan `127.0.0.1`           |

## Catatan keamanan

- Container berjalan sebagai user non-root (`nextjs`) di dalam image.
- App hanya bind ke `127.0.0.1` — tidak terekspos langsung ke internet.
- Semua trafik melewati HTTPS (Certbot).
- Ganti `AUTH_PASSWORD` dengan password kuat (atau bcrypt hash).
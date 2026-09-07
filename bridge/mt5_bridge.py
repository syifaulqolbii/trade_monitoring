#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Freebuff Monitor — Bridge MT5
==============================
Script ini dijalankan di VPS Windows yang sama dengan terminal MT5
(termasuk terminal yang dipakai copier Anda).

Cara kerja:
  1. Attach ke terminal MT5 yang sedang berjalan (attach_existing: true)
     atau login dengan kredensial investor (password/server diisi).
  2. Baca account info, posisi terbuka, dan deal history.
  3. Kirim ke web app (POST /api/bridge/sync) memakai token akun.

Setup:
  - pip install -r requirements.txt
  - Salin config.example.json -> config.json lalu isi datanya.
  - Jalankan: python mt5_bridge.py

Butuh paket MetaTrader5 (hanya jalan di Windows dengan terminal MT5).
"""

import json
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import MetaTrader5 as mt5
except ImportError:
    print("[FATAL] Paket MetaTrader5 tidak terpasang. Jalankan: pip install -r requirements.txt")
    sys.exit(1)

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
STATE_PATH = BASE_DIR / "state.json"

DEFAULT_CONFIG = {
    "app_url": "http://localhost:3000",
    "interval": 30,          # detik antar sinkronisasi
    "history_days": 365,     # berapa hari ke belakang deal history diambil (awal)
    "terminal_path": None,   # opsional: path terminal64.exe MT5
    "accounts": [
        {
            "name": "Akun Utama",
            "login": 12345678,
            "attach_existing": True,
            "password": None,   # password investor — dipakai jika attach_existing false
            "server": None,
            "token": "GANTI_DENGAN_TOKEN_DARI_HALAMAN_AKUN",
        }
    ],
}


def load_config():
    if not CONFIG_PATH.exists():
        print(f"[FATAL] File {CONFIG_PATH} tidak ditemukan.")
        print("        Salin config.example.json -> config.json lalu isi datanya.")
        sys.exit(1)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    for k, v in DEFAULT_CONFIG.items():
        cfg.setdefault(k, v)
    return cfg


def load_state():
    if STATE_PATH.exists():
        try:
            with open(STATE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_state(state):
    try:
        with open(STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[WARN] Gagal menyimpan state: {e}")


def clean(v, default=None):
    """Ganti NaN/Infinity (sering muncul di MT5) dengan default."""
    if v is None:
        return default
    try:
        if isinstance(v, float):
            if v != v or v in (float("inf"), float("-inf")):
                return default
    except Exception:
        pass
    return v


def iso(dt):
    if dt is None:
        return None
    # MT5 mengembalikan waktu sebagai datetime di sebagian versi paket,
    # tapi sebagai int (unix detik) di versi lain — tangani keduanya.
    if isinstance(dt, (int, float)):
        dt = datetime.fromtimestamp(dt, tz=timezone.utc)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def send_payload(cfg, account, payload):
    url = cfg["app_url"].rstrip("/") + "/api/bridge/sync"
    headers = {
        "Authorization": f"Bearer {account['token']}",
        "Content-Type": "application/json",
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return None, str(e)


def collect_account(cfg, account, state):
    """Attach ke terminal, ambil data akun, balikan payload + info deal terakhir."""
    login = account.get("login")
    attach = bool(account.get("attach_existing", True))
    path = account.get("terminal_path") or cfg.get("terminal_path")

    # 1) Initialize: attach ke terminal berjalan atau login dengan kredensial
    if attach:
        if not mt5.initialize(path=path):
            code = mt5.last_error()
            print(f"  [ERROR] Gagal attach terminal ({code}). "
                  f"Pastikan terminal MT5 sedang berjalan di VPS.")
            return None, None
        info = mt5.account_info()
        if info is None or (login and str(info.login) != str(login)):
            print(f"  [ERROR] Terminal aktif login {getattr(info, 'login', '?')}, "
                  f"bukan {login}. Cek konfigurasi.")
            mt5.shutdown()
            return None, None
    else:
        password = account.get("password")
        server = account.get("server")
        if not password or not server:
            print("  [ERROR] attach_existing=false butuh password & server investor.")
            mt5.shutdown()
            return None, None
        if not mt5.initialize(path=path, login=int(login), password=password, server=server):
            code = mt5.last_error()
            print(f"  [ERROR] Gagal login ke MT5 ({code}). Cek kredensial investor.")
            mt5.shutdown()
            return None, None

    try:
        # 2) Account info
        info = mt5.account_info()
        if info is None:
            code = mt5.last_error()
            print(f"  [ERROR] account_info gagal ({code}).")
            return None, None

        account_data = {
            "login": str(info.login),
            "broker": account.get("broker") or "",
            "server": getattr(info, "server", None) or "",
            "currency": getattr(info, "currency", None) or "",
            "leverage": f"1:{info.leverage}" if getattr(info, "leverage", None) else None,
            "company": getattr(info, "company", None) or "",
            "balance": float(info.balance),
            "equity": float(info.equity),
            "margin": float(info.margin),
            "freeMargin": float(info.margin_free),
        }

        # 3) Posisi terbuka
        positions = []
        try:
            for p in mt5.positions_get() or ():
                positions.append({
                    "ticket": p.ticket,
                    "symbol": p.symbol,
                    "type": int(p.type),          # 0 buy, 1 sell
                    "volume": float(p.volume),
                    "priceOpen": float(clean(p.price_open, 0.0)),
                    "sl": clean(p.sl),
                    "tp": clean(p.tp),
                    "priceCurrent": float(clean(p.price_current, p.price_open)),
                    "profit": float(p.profit),
                    "swap": float(clean(p.swap, 0.0)),
                    "comment": getattr(p, "comment", None),
                    "magic": getattr(p, "magic", None),
                    "openTime": iso(p.time),
                })
        except Exception as e:
            print(f"  [WARN] Gagal baca posisi: {e}")

        # 4) Deal history
        # Catatan: history_deals_get membaca cache lokal terminal yang bisa STALE
        # (deal terlihat di UI terminal tapi tidak dikembalikan API). Karena itu
        # kita selalu ambil window bergulir min. 3 hari terakhir + overlap 24 jam
        # dari deal terakhir yang sudah terkirim — server melakukan dedupe per
        # ticket, jadi mengirim ulang deal lama aman.
        last_deal_time = state.get("last_deal_time") if state else None
        date_from = None
        if last_deal_time:
            try:
                date_from = datetime.fromisoformat(last_deal_time.replace("Z", "+00:00"))
            except Exception:
                date_from = None
        if date_from is not None:
            date_from = min(
                date_from - timedelta(hours=24),
                datetime.now(timezone.utc) - timedelta(days=3),
            )
        else:
            date_from = datetime.now(timezone.utc) - timedelta(days=cfg.get("history_days", 365))
        date_to = datetime.now(timezone.utc) + timedelta(minutes=1)

        deals = []
        max_deal_time = None
        try:
            raw_deals = mt5.history_deals_get(date_from, date_to) or ()
            for d in raw_deals:
                deals.append({
                    "ticket": d.ticket,
                    "positionId": getattr(d, "position_id", None),
                    "symbol": d.symbol,
                    "type": int(d.type),
                    "direction": int(d.entry),  # 0 in, 1 out, 2 inout
                    "volume": float(d.volume),
                    "price": float(d.price),
                    "profit": float(d.profit),
                    "commission": float(clean(d.commission, 0.0)),
                    "swap": float(clean(d.swap, 0.0)),
                    "fee": float(clean(d.fee, 0.0)),
                    "comment": getattr(d, "comment", None),
                    "magic": getattr(d, "magic", None),
                    "time": iso(d.time),
                })
                if max_deal_time is None or d.time > max_deal_time:
                    max_deal_time = d.time
            print(f"  [OK] {len(deals)} deals terbaca, {len(positions)} posisi terbuka.")
        except Exception as e:
            print(f"  [WARN] Gagal baca deal history: {e}")

        payload = {
            "account": account_data,
            "positions": positions,
            "deals": deals,
        }
        return payload, max_deal_time
    finally:
        mt5.shutdown()


def main():
    cfg = load_config()
    state = load_state()

    app_url = cfg.get("app_url", "").rstrip("/")
    interval = max(5, int(cfg.get("interval", 30)))

    print("=" * 60)
    print("Freebuff Monitor — Bridge MT5")
    print(f"App URL : {app_url}")
    print(f"Interval: {interval} detik")
    print(f"Akun    : {len(cfg['accounts'])}")
    print("=" * 60)

    if not cfg.get("accounts"):
        print("[FATAL] Tidak ada akun di config.json")
        sys.exit(1)

    while True:
        for account in cfg["accounts"]:
            name = account.get("name", account.get("login", "?"))
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Sinkronisasi: {name}")
            # Guard terakhir: satu exception tak terduga tidak boleh mematikan
            # seluruh bridge — cukup lewati siklus ini.
            try:
                payload, max_deal_time = collect_account(cfg, account, state)
                if payload is None:
                    print(f"  [SKIP] {name} dilewati (gagal konek).")
                    continue

                status, body = send_payload(cfg, account, payload)
            except Exception as e:
                print(f"  [ERROR] Exception siklus: {e!r}. Lanjut siklus berikutnya.")
                continue

            if status == 200:
                deals_added = 0
                try:
                    res = json.loads(body)
                    deals_added = int(res.get("dealsAdded", 0))
                    print(f"  [OK] Server: deals={deals_added} ditambah, "
                          f"posisi={res.get('positionsReplaced', 0)}, "
                          f"balance={payload['account']['balance']:.2f} "
                          f"{payload['account'].get('currency', '')}")
                except Exception:
                    print(f"  [OK] Server menerima data.")

                # Deteksi history cache stale: balance berubah tapi tidak ada
                # deal baru selama beberapa siklus beruntun. Bandingkan dengan
                # balance SAAT streak stale dimulai (bukan siklus sebelumnya).
                balance = payload["account"]["balance"]
                stale = 0 if deals_added > 0 else int(state.get("stale_cycles", 0)) + 1
                if stale == 1:
                    state["stale_start_balance"] = balance
                elif stale == 10:
                    start_bal = state.get("stale_start_balance")
                    if start_bal is not None and abs(balance - start_bal) > 0.001:
                        print("  [WARN] Balance berubah tapi tidak ada deal baru dari terminal.")
                        print("         History cache MT5 kemungkinan stale. Buka MT5 → Toolbox →")
                        print("         tab History → klik kanan → 'All History', atau restart terminal.")
                        print("         Bridge akan backfill otomatis begitu cache menyegarkan.")
                if stale == 0:
                    state.pop("stale_start_balance", None)
                state["stale_cycles"] = stale
                state["last_balance"] = balance

                if max_deal_time is not None:
                    # iso() menangani int (unix detik) maupun datetime.
                    # Jangan pernah mundur: pakai yang paling baru.
                    new_iso = iso(max_deal_time)
                    prev_iso = state.get("last_deal_time")
                    if not prev_iso or (new_iso or "") > prev_iso:
                        state["last_deal_time"] = new_iso
                save_state(state)
            elif status == 401:
                print(f"  [ERROR] Token ditolak server. Cek token akun di halaman Akun.")
            elif status == 400:
                print(f"  [ERROR] Payload ditolak server: {body[:200]}")
            else:
                print(f"  [ERROR] Gagal kirim (HTTP {status}): {body[:200]}")

        print(f"\nMenunggu {interval} detik...")
        time.sleep(interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBridge dihentikan.")
        sys.exit(0)
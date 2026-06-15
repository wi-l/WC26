#!/usr/bin/env python3
"""Serve the WC2026 app and self-refresh data.json on a background timer."""
import json
import os
import threading
import time
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json"
DATA = os.path.join(ROOT, "data.json")
REFRESH_SECONDS = 1800  # 30 min
PORT = 8456


def log(msg):
    print(f"[{time.strftime('%Y-%m-%dT%H:%M:%S%z')}] {msg}", flush=True)


def refresh_once():
    try:
        with urllib.request.urlopen(URL, timeout=20) as r:
            raw = r.read()
        data = json.loads(raw)
        if not data.get("matches"):
            raise ValueError("no matches in payload")
        tmp = DATA + ".tmp"
        with open(tmp, "wb") as f:
            f.write(raw)
        os.replace(tmp, DATA)  # atomic
        log(f"refreshed data.json ({len(data['matches'])} matches)")
    except Exception as e:  # keep serving the last good file on any failure
        log(f"refresh failed, keeping existing data.json: {e}")


def refresh_loop():
    while True:
        refresh_once()
        time.sleep(REFRESH_SECONDS)


def main():
    threading.Thread(target=refresh_loop, daemon=True).start()
    handler = partial(SimpleHTTPRequestHandler, directory=ROOT)
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), handler)
    log(f"serving {ROOT} on http://0.0.0.0:{PORT} (refresh every {REFRESH_SECONDS}s)")
    httpd.serve_forever()


if __name__ == "__main__":
    main()

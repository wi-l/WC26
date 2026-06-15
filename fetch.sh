#!/usr/bin/env bash
# Refresh the local World Cup 2026 data from openfootball (public domain, no key).
set -euo pipefail
cd "$(dirname "$0")"
URL="https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json"
tmp="$(mktemp)"
curl -fsSL "$URL" -o "$tmp"
# Sanity check it's valid JSON with matches before replacing.
python3 -c "import json,sys; d=json.load(open('$tmp')); assert d.get('matches'); print('ok', len(d['matches']), 'matches')"
mv "$tmp" data.json
echo "Updated data.json at $(date -Is)"

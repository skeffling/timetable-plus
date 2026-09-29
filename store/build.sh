#!/usr/bin/env bash
# Builds the upload zips for the Chrome Web Store and Firefox Add-ons (AMO) into dist/.
# The source manifest loads unpacked in both browsers; each store gets a copy with the
# other browser's keys removed:
#   Chrome:  background.service_worker only, no browser_specific_settings.
#   Firefox: background.scripts only.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(python3 -c 'import json; print(json.load(open("extension/manifest.json"))["version"])')
rm -rf dist && mkdir -p dist/chrome dist/firefox

for target in chrome firefox; do
  rsync -a --exclude '.DS_Store' extension/ "dist/$target/"
  python3 - "$target" "dist/$target/manifest.json" <<'PY'
import json, sys
target, path = sys.argv[1], sys.argv[2]
m = json.load(open(path))
if target == "chrome":
    m["background"].pop("scripts")
    m.pop("browser_specific_settings")
else:
    m["background"].pop("service_worker")
json.dump(m, open(path, "w"), indent=2)
PY
  (cd "dist/$target" && zip -qr -X "../timetable-plus-$version-$target.zip" .)
done

echo "Built:"
ls -1 dist/*.zip

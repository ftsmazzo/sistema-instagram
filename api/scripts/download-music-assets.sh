#!/bin/sh
# Baixa trilhas CC0 (FreePD / freepd.com) para uso offline no slideshow Reels.
set -eu
mkdir -p assets/music
BASE="https://raw.githubusercontent.com/0lhi/FreePD/stream"
fetch() {
  url="$1"
  out="$2"
  echo "Downloading $out..."
  curl -fsSL "$url" -o "assets/music/$out"
}
fetch "$BASE/Electronic/Meditating%20Beat.mp3" "serene.mp3"
fetch "$BASE/Upbeat/Inspiration.mp3" "dreaming.mp3"
fetch "$BASE/Upbeat/Bar%20Brawl.mp3" "champion.mp3"
fetch "$BASE/Electronic/Backbeat.mp3" "tech.mp3"
fetch "$BASE/Electronic/Bit%20Bit%20Loop.mp3" "lofi.mp3"
fetch "$BASE/Upbeat/Stereotype%20News.mp3" "corporate.mp3"
fetch "$BASE/Upbeat/Relaxing%20Ballad.mp3" "beauty.mp3"
echo "Music assets OK ($(ls assets/music | wc -l) files)"

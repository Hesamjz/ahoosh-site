#!/usr/bin/env bash
# Encode one svc video: frames -> mp4 (h264) + webm (vp9). Target < 1.6MB each.
set -e
NAME="$1"          # e.g. svc1
FR="/tmp/ahoosh_frames/$NAME"
OUT="${OUT:?set OUT}"
FPS=24

# ---- mp4 (libx264). yuv420p, faststart. CRF 26 + maxrate cap to keep < 1.6MB. ----
ffmpeg -y -framerate $FPS -i "$FR/%04d.png" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf 26 -maxrate 2400k -bufsize 4800k \
  -preset slow -movflags +faststart -an \
  "$OUT/$NAME.mp4" -loglevel error

# ---- webm (libvpx-vp9). Two-pass-ish single pass with target bitrate. ----
ffmpeg -y -framerate $FPS -i "$FR/%04d.png" \
  -c:v libvpx-vp9 -pix_fmt yuv420p \
  -b:v 0 -crf 34 -row-mt 1 -an \
  "$OUT/$NAME.webm" -loglevel error

echo "$NAME -> $(du -h "$OUT/$NAME.mp4"|cut -f1) mp4 / $(du -h "$OUT/$NAME.webm"|cut -f1) webm"

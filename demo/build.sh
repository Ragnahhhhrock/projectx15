#!/usr/bin/env bash
# Assemble captured frames + cards into final videos.
# Usage: demo/build.sh <workdir> <outdir>   (workdir holds land/ port/ frames and card-*.png)
set -euo pipefail
W=${1:?workdir}; O=${2:?outdir}; mkdir -p "$O"
FONT=${FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf}

build() { # fmt dir outW outH fontsize boxy
  local fmt=$1 dir=$2 ow=$3 oh=$4 fs=$5 y=$6 out=$7
  local cap="drawtext=fontfile=$FONT:fontsize=$fs:fontcolor=0xe9f3e4:box=1:boxcolor=0x05070acc:boxborderw=14:x=(w-text_w)/2:y=$y"
  local caps=""
  add() { caps+=",${cap}:text='$3':enable='between(t,$1,$2)'"; }
  add 0.2 1.4  'CARRIED BY THE NB-52'
  add 1.6 5.9  'DROP + XLR99 IGNITION'
  add 6.1 10.9 'BOOST TO MACH 5.8'
  add 11.1 14.9 'EDGE OF SPACE: 377,000 FT'
  add 15.1 18.4 'RE-ENTRY'
  add 18.6 23.3 'LAND ON ROGERS DRY LAKE'
  ffmpeg -y -loglevel error \
    -loop 1 -t 2 -framerate 30 -i "$W/card-$fmt-intro.png" \
    -framerate 30 -i "$W/$dir/f%05d.jpg" \
    -loop 1 -t 3 -framerate 30 -i "$W/card-$fmt-outro.png" \
    -i "$W/music.wav" \
    -filter_complex "
      [0:v]scale=$ow:$oh:flags=lanczos,setsar=1,fps=30,format=yuv420p,fade=t=out:st=1.6:d=0.4[a];
      [1:v]scale=$ow:$oh:flags=lanczos,setsar=1,fps=30,format=yuv420p${caps},fade=t=in:st=0:d=0.5,fade=t=out:st=23:d=0.5[b];
      [2:v]scale=$ow:$oh:flags=lanczos,setsar=1,fps=30,format=yuv420p,fade=t=in:st=0:d=0.5[c];
      [a][b][c]concat=n=3:v=1:a=0[v]" \
    -map "[v]" -map 3:a -shortest \
    -c:v libx264 -preset slow -crf 17 -profile:v high -pix_fmt yuv420p -movflags +faststart \
    -c:a aac -b:a 128k "$out"
}

build land land 1920 1080 40 'h-th-70' "$O/projectx15-demo-youtube-1080p.mp4"
build port port 1080 1920 40 'h-th-260' "$O/projectx15-demo-mobile-1080x1920.mp4"

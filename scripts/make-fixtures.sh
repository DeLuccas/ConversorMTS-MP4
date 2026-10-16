#!/usr/bin/env bash
# Gera vídeos curtos no formato das filmadoras AVCHD: 1080i entrelaçado (H.264) + áudio AC-3, em MPEG-TS.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p test-fixtures/AVCHD/BDMV/STREAM
command -v ffmpeg >/dev/null || { echo "ffmpeg não encontrado; pulando fixtures."; exit 0; }

make() {
  local out=$1 src=$2 freq=$3 stamp=$4
  # Fonte a 59,94p entrelaçada em 29,97i (campo superior primeiro): o movimento gera o "pente" real,
  # e o ruído temporal imita o chuvisco de pouca luz.
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "$src,noise=alls=9:allf=t+u,tinterlace=mode=interleave_top,setfield=tff" -f lavfi -i "sine=frequency=$freq:sample_rate=48000" -t 5 \
    -c:v libx264 -preset veryfast -b:v 6M -flags +ilme+ildct -top 1 -pix_fmt yuv420p \
    -c:a ac3 -b:a 256k -ac 2 -f mpegts "$out"
  touch -d "$stamp" "$out"
}

make test-fixtures/AVCHD/BDMV/STREAM/00000.MTS "testsrc2=size=1920x1080:rate=60000/1001" 440 "2011-03-12 14:32:10"
make test-fixtures/AVCHD/BDMV/STREAM/00001.MTS "testsrc=size=1920x1080:rate=60000/1001" 660 "2011-03-12 15:05:40"
make test-fixtures/AVCHD/BDMV/STREAM/00002.MTS "mandelbrot=size=1920x1080:rate=60000/1001" 880 "2011-03-13 10:12:05"
# Um arquivo que não é vídeo, para conferir que é ignorado
echo "INDX" > test-fixtures/AVCHD/BDMV/index.bdmv
# Cópias planas para o teste de "Escolher arquivos"
cp -p test-fixtures/AVCHD/BDMV/STREAM/*.MTS test-fixtures/
echo "Fixtures em test-fixtures/"
ls -la test-fixtures test-fixtures/AVCHD/BDMV/STREAM

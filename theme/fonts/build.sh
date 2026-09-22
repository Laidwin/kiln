#!/usr/bin/env sh
# Rebuild inter-kiln.woff2, the trimmed Inter shipped with the theme.
#
# Starting from Inter's variable Latin subset, it keeps the 400–700 weight range, the Latin-1
# characters and punctuation, and only the OpenType features the theme uses. Result: ~28 kB
# instead of ~48 kB, which keeps the Lighthouse mobile score above 95.
#
# Requires: pip install fonttools brotli
set -eu
cd "$(dirname "$0")"
src="${1:?usage: build.sh <path to inter-latin-wght-normal.woff2 from @fontsource-variable/inter>}"
tmp="$(mktemp -d)"
fonttools varLib.instancer "$src" wght=400:700 -o "$tmp/inter.ttf" -q
pyftsubset "$tmp/inter.ttf" \
	--unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2197,U+2212,U+2215,U+2318,U+2325,U+21E7,U+FEFF,U+FFFD" \
	--layout-features="kern,liga,calt,ccmp,locl,mark,mkmk,cv05,cv08,cv11,ss03,tnum,case" \
	--flavor=woff2 --output-file=inter-kiln.woff2
rm -rf "$tmp"
ls -l inter-kiln.woff2

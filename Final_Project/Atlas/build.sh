#!/bin/sh
# Build the Atlas MQTT middleware on Raspberry Pi OS ARM64.
# Keep CMake output separate from the middleware sources and service bundles.
set -eu

cd -- "$(dirname -- "$0")"

if [ "$(uname -m)" != aarch64 ] || [ "$(getconf LONG_BIT)" != 64 ]; then
    printf '%s\n' 'Atlas requires Raspberry Pi OS ARM64 (64-bit userspace).' >&2
    exit 1
fi

cmake -S Main -B build
cmake --build build "$@"

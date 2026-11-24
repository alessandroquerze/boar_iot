#!/bin/sh
# Start from the middleware directory so Atlas can find its XML and service bundles.
# Also make the packaged ARM64 libraries and resource compiler available to it.
set -eu

cd -- "$(dirname -- "$0")"
atlas_root=$(pwd -P)

if [ "$(uname -m)" != aarch64 ] || [ "$(getconf LONG_BIT)" != 64 ]; then
    printf '%s\n' 'Atlas requires Raspberry Pi OS ARM64 (64-bit userspace).' >&2
    exit 1
fi

binary=build/Atlas
case "${1-}" in
    '')
        if [ -f bin/Atlas ]; then
            binary=bin/Atlas
        fi
        ;;
    --build) ;;
    *)
        printf '%s\n' 'Usage: sh run.sh [--build]' >&2
        exit 2
        ;;
esac

if [ ! -f "$binary" ]; then
    printf '%s\n' 'Atlas executable missing. Run: sh build.sh' >&2
    exit 1
fi

resource_compiler=lib/bin/usResourceCompiler4
if [ -f "$resource_compiler" ] && [ ! -x "$resource_compiler" ]; then
    chmod u+x "$resource_compiler"
fi
if [ ! -x "$binary" ]; then
    chmod u+x "$binary"
fi

export PATH="$atlas_root/lib/bin:$PATH"
export LD_LIBRARY_PATH="$atlas_root/lib/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "./$binary"

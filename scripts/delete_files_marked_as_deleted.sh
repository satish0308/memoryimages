#!/usr/bin/env bash
# ==============================================================================
# MyMemoryPics - Host OS Disk Purge Launcher
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="${SCRIPT_DIR}/delete_files_marked_as_deleted.py"

if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required to run this script on the host." >&2
    exit 1
fi

python3 "${PYTHON_SCRIPT}" "$@"

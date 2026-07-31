#!/usr/bin/env bash
set -e

# ==========================================
# Lab Record System — Automated Restart Script
# ==========================================

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "\033[1;\033[0;36m[restart] 🔄 Restarting Lab Record System...\033[0m"

"${SCRIPT_DIR}/stop.sh"
echo ""
"${SCRIPT_DIR}/start.sh"

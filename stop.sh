#!/usr/bin/env bash

# ==========================================
# Lab Record System — Automated Stop Script
# ==========================================

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}${CYAN}====================================================${NC}"
echo -e "${BOLD}${CYAN}   🛑 Lab Record System — Stopping All Services     ${NC}"
echo -e "${BOLD}${CYAN}====================================================${NC}"

# 1. Stop Docker Compose Stack
if command -v docker-compose >/dev/null 2>&1; then
    echo -e "${CYAN}[stop] 🐳 Stopping Docker Compose containers...${NC}"
    docker-compose down --remove-orphans || true
fi

# 2. Kill lingering processes on ports 7001 and 5173
PID_7001=$(lsof -nP -iTCP:7001 -sTCP:LISTEN -t 2>/dev/null || true)
PID_5173=$(lsof -nP -iTCP:5173 -sTCP:LISTEN -t 2>/dev/null || true)

if [ -n "$PID_7001" ]; then
    echo -e "${YELLOW}[stop] 🧹 Stopping local process on port 7001 (PID $PID_7001)...${NC}"
    kill -9 "$PID_7001" 2>/dev/null || true
fi

if [ -n "$PID_5173" ]; then
    echo -e "${YELLOW}[stop] 🧹 Stopping local process on port 5173 (PID $PID_5173)...${NC}"
    kill -9 "$PID_5173" 2>/dev/null || true
fi

echo -e "${BOLD}${GREEN}[stop] ✅ All Lab Record System services stopped successfully.${NC}"

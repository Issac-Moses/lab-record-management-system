#!/usr/bin/env bash

# ==========================================
# Lab Record System — Safe Docker Cleanup Script
# ==========================================

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}${CYAN}====================================================${NC}"
echo -e "${BOLD}${CYAN}   🧹 Lab Record System — Safe Docker Cleanup       ${NC}"
echo -e "${BOLD}${CYAN}====================================================${NC}"

if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}[clean] ⚠️ Docker Engine is not running. Nothing to clean.${NC}"
    exit 0
fi

echo -e "${CYAN}[clean] 1/4 Removing stopped containers...${NC}"
docker container prune -f

echo -e "${CYAN}[clean] 2/4 Removing dangling images...${NC}"
docker image prune -f

echo -e "${CYAN}[clean] 3/4 Removing unused networks...${NC}"
docker network prune -f

echo -e "${CYAN}[clean] 4/4 Removing build cache...${NC}"
docker builder prune -f || docker buildx prune -f || true

echo ""
echo -e "${BOLD}${GREEN}[clean] ✅ Safe Docker cleanup complete! Active project images were preserved.${NC}"

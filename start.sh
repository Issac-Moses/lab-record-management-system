#!/usr/bin/env bash
set -e

# ==========================================
# Lab Record System — Fast Automated Startup Script
# ==========================================

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}====================================================${NC}"
echo -e "${BOLD}${CYAN}   🚀 Lab Record System — Automated Local Startup   ${NC}"
echo -e "${BOLD}${CYAN}====================================================${NC}"

# Ensure jobs directory for logs
mkdir -p jobs

# 1. Environment Template Setup
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}[start] ⚠️ .env not found. Creating from .env.example...${NC}"
    cp .env.example .env
fi

# 2. Detect & Launch Docker Desktop (macOS)
echo -e "${CYAN}[start] 🔍 Checking Docker Engine status...${NC}"

if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}[start] ⚙️ Docker Desktop is not running. Launching Docker Desktop...${NC}"
    
    if [ "$(uname)" == "Darwin" ]; then
        open -a "Docker" || open -a "Docker Desktop" || true
    else
        echo -e "${RED}[start] ❌ Docker is not running. Please start Docker Engine and try again.${NC}"
        exit 1
    fi

    echo -n -e "${CYAN}[start] ⏳ Waiting for Docker Engine to be ready...${NC}"
    MAX_WAIT=60
    WAIT_COUNT=0

    until docker info > /dev/null 2>&1; do
        sleep 2
        WAIT_COUNT=$((WAIT_COUNT + 2))
        echo -n "."
        if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
            echo ""
            echo -e "${RED}[start] ❌ Docker Engine failed to start within ${MAX_WAIT}s. Exiting.${NC}"
            exit 1
        fi
    done
    echo -e " ${GREEN}Ready!${NC}"
else
    echo -e "${GREEN}[start] ✅ Docker Engine is up and running.${NC}"
fi

# 3. Verify ML/DL Python Image (lab-python-ml:latest)
echo -e "${CYAN}[start] 🐍 Verifying TensorFlow/ML Docker container image...${NC}"
if ! docker image inspect lab-python-ml:latest > /dev/null 2>&1; then
    echo -e "${YELLOW}[start] 🔨 Building lab-python-ml:latest image (TensorFlow/Keras/Data Science)...${NC}"
    if [ -f "docker/Dockerfile.python-ml" ]; then
        DOCKER_BUILDKIT=0 docker build -t lab-python-ml:latest -f docker/Dockerfile.python-ml docker/
    fi
else
    echo -e "${GREEN}[start] ✅ TensorFlow ML image (lab-python-ml:latest) is ready.${NC}"
fi

# 4. Stop existing local background processes on 7001 and 5173
PID_7001=$(lsof -nP -iTCP:7001 -sTCP:LISTEN -t 2>/dev/null || true)
PID_5173=$(lsof -nP -iTCP:5173 -sTCP:LISTEN -t 2>/dev/null || true)

if [ -n "$PID_7001" ]; then
    echo -e "${YELLOW}[start] 🧹 Stopping existing backend process on port 7001 (PID $PID_7001)...${NC}"
    kill -9 "$PID_7001" 2>/dev/null || true
fi

if [ -n "$PID_5173" ]; then
    echo -e "${YELLOW}[start] 🧹 Stopping existing frontend process on port 5173 (PID $PID_5173)...${NC}"
    kill -9 "$PID_5173" 2>/dev/null || true
fi

# 5. Launch Backend Server & Frontend Dev Server
echo -e "${CYAN}[start] ⚡ Starting Backend API Server (port 7001)...${NC}"
nohup node server.cjs > jobs/backend.log 2>&1 &

echo -e "${CYAN}[start] 🌐 Starting Frontend Dev Server (port 5173)...${NC}"
nohup npm run dev -- --host > jobs/frontend.log 2>&1 &

# 6. Check Health
echo -n -e "${CYAN}[start] 🏥 Checking Backend & Frontend health...${NC}"
HEALTH_WAIT=15
HEALTH_COUNT=0
HEALTHY=false

until [ "$HEALTHY" = true ]; do
    if curl -s -f http://localhost:7001/ > /dev/null 2>&1 && curl -s http://localhost:5173 > /dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    sleep 1
    HEALTH_COUNT=$((HEALTH_COUNT + 1))
    echo -n "."
    if [ $HEALTH_COUNT -ge $HEALTH_WAIT ]; then
        echo ""
        echo -e "${YELLOW}[start] ⚠️ Health check timeout. Checking logs in jobs/backend.log & jobs/frontend.log.${NC}"
        break
    fi
done

if [ "$HEALTHY" = true ]; then
    echo -e " ${GREEN}Healthy!${NC}"
fi

echo ""
echo -e "${BOLD}${GREEN}====================================================${NC}"
echo -e "${BOLD}${GREEN}  ✨ Lab Record System Started Successfully!       ${NC}"
echo -e "${BOLD}${GREEN}====================================================${NC}"
echo -e "${BOLD}🌐 Frontend Web App:${NC}  ${CYAN}http://localhost:5173${NC}"
echo -e "${BOLD}⚡ Backend API Server:${NC} ${CYAN}http://localhost:7001${NC}"
echo -e "${BOLD}🐳 Code Runner Engine:${NC} ${GREEN}Active (9 Languages + TensorFlow 2.x)${NC}"
echo -e "${CYAN}----------------------------------------------------${NC}"
echo -e "To view backend logs:  ${YELLOW}cat jobs/backend.log${NC}"
echo -e "To view frontend logs: ${YELLOW}cat jobs/frontend.log${NC}"
echo -e "To stop all services:  ${YELLOW}./stop.sh${NC}"
echo -e "To restart services:   ${YELLOW}./restart.sh${NC}"
echo -e "${BOLD}${GREEN}====================================================${NC}"

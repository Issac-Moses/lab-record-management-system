#!/usr/bin/env bash

# ====================================================
# Lab Record System — Preflight Diagnostics Doctor
# ====================================================

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

print_header() {
    echo -e "${BOLD}${CYAN}====================================================${NC}"
    echo -e "${BOLD}${CYAN}   🩺 Lab Record System — Preflight Doctor Diagnostic ${NC}"
    echo -e "${BOLD}${CYAN}====================================================${NC}"
}

print_check() {
    local status=$1
    local title=$2
    local message=$3
    local fix=$4

    case $status in
        "PASS")
            echo -e "  [${GREEN}PASS${NC}] ${BOLD}${title}${NC} — ${message}"
            PASS_COUNT=$((PASS_COUNT + 1))
            ;;
        "WARN")
            echo -e "  [${YELLOW}WARN${NC}] ${BOLD}${title}${NC} — ${message}"
            if [ -n "$fix" ]; then
                echo -e "         ${YELLOW}💡 Suggested Fix:${NC} ${fix}"
            fi
            WARN_COUNT=$((WARN_COUNT + 1))
            ;;
        "FAIL")
            echo -e "  [${RED}FAIL${NC}] ${BOLD}${title}${NC} — ${message}"
            if [ -n "$fix" ]; then
                echo -e "         ${RED}💡 Suggested Fix:${NC} ${fix}"
            fi
            FAIL_COUNT=$((FAIL_COUNT + 1))
            ;;
    esac
}

main() {
    print_header
    echo ""

    # 1. Check Docker Desktop Installation
    if [ -d "/Applications/Docker.app" ] || command -v docker >/dev/null 2>&1; then
        print_check "PASS" "Docker Desktop Installed" "Docker application binary found."
    else
        print_check "FAIL" "Docker Desktop Installed" "Docker Desktop is not installed." "Install Docker Desktop from https://www.docker.com/products/docker-desktop"
    fi

    # 2. Check Docker Engine Status
    if docker info >/dev/null 2>&1; then
        print_check "PASS" "Docker Engine Running" "Daemon is active and accepting commands."
    else
        print_check "FAIL" "Docker Engine Running" "Docker daemon is not running." "Launch Docker Desktop or run './start.sh' to start it automatically."
    fi

    # 3. Check Docker Compose Availability
    if command -v docker-compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1; then
        print_check "PASS" "Docker Compose Available" "Compose CLI tool detected."
    else
        print_check "FAIL" "Docker Compose Available" "Docker Compose not found." "Install Docker Desktop which includes docker-compose."
    fi

    # 4. Check Ports 7001 & 5173
    PID_7001=$(lsof -nP -iTCP:7001 -sTCP:LISTEN -t 2>/dev/null || true)
    PID_5173=$(lsof -nP -iTCP:5173 -sTCP:LISTEN -t 2>/dev/null || true)

    if [ -n "$PID_7001" ]; then
        print_check "PASS" "Backend Port 7001" "Port 7001 is active (PID: $PID_7001)."
    else
        print_check "WARN" "Backend Port 7001" "Port 7001 is currently free (Backend not running)." "Run './start.sh' to launch backend server."
    fi

    if [ -n "$PID_5173" ]; then
        print_check "PASS" "Frontend Port 5173" "Port 5173 is active (PID: $PID_5173)."
    else
        print_check "WARN" "Frontend Port 5173" "Port 5173 is currently free (Frontend not running)." "Run './start.sh' to launch frontend server."
    fi

    # 5. Check Environment File (.env)
    if [ -f ".env" ]; then
        print_check "PASS" "Environment File (.env)" ".env file exists at project root."
    else
        print_check "WARN" "Environment File (.env)" ".env file is missing." "Run 'cp .env.example .env'."
    fi

    # 6. Check Basic Execution Docker Images
    REQUIRED_IMAGES=("gcc:latest" "eclipse-temurin:17" "python:3.10")
    MISSING_IMAGES=()
    for img in "${REQUIRED_IMAGES[@]}"; do
        if ! docker image inspect "$img" >/dev/null 2>&1; then
            MISSING_IMAGES+=("$img")
        fi
    done

    if [ ${#MISSING_IMAGES[@]} -eq 0 ]; then
        print_check "PASS" "Base Runner Images" "gcc, eclipse-temurin:17, python:3.10 images exist."
    else
        print_check "WARN" "Base Runner Images" "Missing base image(s): ${MISSING_IMAGES[*]}." "Images will be auto-pulled on first code execution."
    fi

    # 7. Check TensorFlow ML Image (lab-python-ml:latest)
    if docker image inspect lab-python-ml:latest >/dev/null 2>&1; then
        print_check "PASS" "TensorFlow ML Image" "lab-python-ml:latest image is pre-built."
    else
        print_check "WARN" "TensorFlow ML Image" "lab-python-ml:latest image is missing." "Run './start.sh' to build TensorFlow image automatically."
    fi

    # 8. Check Node.js Version
    if command -v node >/dev/null 2>&1; then
        NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VER" -ge 18 ]; then
            print_check "PASS" "Node.js Environment" "Node.js $(node -v) detected (v18+ compatible)."
        else
            print_check "FAIL" "Node.js Environment" "Node.js $(node -v) is older than required v18." "Upgrade Node.js to v18 or v20 LTS."
        fi
    else
        print_check "FAIL" "Node.js Environment" "Node.js binary not found." "Install Node.js from https://nodejs.org."
    fi

    # 9. Check npm Dependencies
    if [ -d "node_modules" ]; then
        print_check "PASS" "npm Dependencies" "node_modules directory present."
    else
        print_check "FAIL" "npm Dependencies" "node_modules missing." "Run 'npm install'."
    fi

    # 10. Check Available Disk Space (>= 5 GB)
    FREE_KB=$(df -k . | tail -1 | awk '{print $4}')
    FREE_GB=$((FREE_KB / 1024 / 1024))
    if [ "$FREE_GB" -ge 5 ]; then
        print_check "PASS" "Disk Space" "${FREE_GB} GB free disk space available."
    else
        print_check "WARN" "Disk Space" "Low disk space: ${FREE_GB} GB free." "Free up space for Docker container logs & images."
    fi

    # 11. Check System RAM (macOS / Linux)
    if [ "$(uname)" == "Darwin" ]; then
        RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
        RAM_GB=$((RAM_BYTES / 1024 / 1024 / 1024))
    else
        RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
        RAM_GB=$((RAM_KB / 1024 / 1024))
    fi

    if [ "$RAM_GB" -ge 4 ]; then
        print_check "PASS" "System RAM" "${RAM_GB} GB Total RAM detected."
    else
        print_check "WARN" "System RAM" "${RAM_GB} GB Total RAM detected (4GB+ recommended)." "Close memory-heavy applications."
    fi

    # 12. Check Backend API Reachability
    if curl -s -f http://localhost:7001/ >/dev/null 2>&1; then
        print_check "PASS" "Backend API Reachable" "http://localhost:7001 responds Healthy."
    else
        print_check "WARN" "Backend API Reachable" "http://localhost:7001 not responding." "Start server using './start.sh'."
    fi

    # 13. Check Frontend Reachability
    if curl -s http://localhost:5173 >/dev/null 2>&1; then
        print_check "PASS" "Frontend Reachable" "http://localhost:5173 is accessible."
    else
        print_check "WARN" "Frontend Reachable" "http://localhost:5173 not responding." "Start frontend using './start.sh'."
    fi

    # 14. Check Execution Engine Readiness (POST /run test)
    RUN_RES=$(curl -s -X POST http://localhost:7001/run -H "Content-Type: application/json" -d '{"language":"python","code":"print(\"Doctor Engine Test\")","input":""}' 2>/dev/null || echo "")
    if echo "$RUN_RES" | grep -q '"success":true'; then
        print_check "PASS" "Execution Engine Ready" "Docker code execution verified clean."
    else
        print_check "WARN" "Execution Engine Ready" "Backend execution check returned no response." "Run './start.sh' to verify backend Docker socket permissions."
    fi

    echo ""
    echo -e "${BOLD}${CYAN}====================================================${NC}"
    echo -e "${BOLD}Diagnostic Summary:${NC} ${GREEN}${PASS_COUNT} PASSED${NC} | ${YELLOW}${WARN_COUNT} WARNINGS${NC} | ${RED}${FAIL_COUNT} FAILS${NC}"
    echo -e "${BOLD}${CYAN}====================================================${NC}"

    if [ $FAIL_COUNT -gt 0 ]; then
        echo -e "${RED}❌ Issues detected. Please follow suggested fixes above.${NC}"
        exit 1
    elif [ $WARN_COUNT -gt 0 ]; then
        echo -e "${YELLOW}⚠️ System operational with minor warnings. Run './start.sh' to launch.${NC}"
    else
        echo -e "${GREEN}✨ All systems operational! Ready to run './start.sh'.${NC}"
    fi
}

main "$@"

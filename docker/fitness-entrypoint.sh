#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# Fitness Check Entrypoint — runs all hard gates sequentially
# Similar to GitHub Actions CI pipeline
# ═══════════════════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASSED=0
FAILED=0
FAILURES=()

run_check() {
    local name="$1"
    shift
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}▶ ${name}${NC}"
    echo -e "${CYAN}  $ $*${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local start_time
    start_time=$(date +%s)

    if "$@"; then
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${GREEN}✅ ${name} — PASSED (${duration}s)${NC}"
        PASSED=$((PASSED + 1))
    else
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${RED}❌ ${name} — FAILED (${duration}s)${NC}"
        FAILED=$((FAILED + 1))
        FAILURES+=("$name")
    fi
}

echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║           ROUTA.JS FITNESS CHECK (Docker CI)                ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Node: $(node --version)  |  npm: $(npm --version)  |  Rust: $(rustc --version)"
echo ""

# If arguments are passed, run them as a command instead of full fitness
if [ $# -gt 0 ]; then
    echo -e "${CYAN}Running custom command: $*${NC}"
    exec "$@"
fi

# ── Hard Gate 1: TypeScript Tests ──────────────────────────────────────
run_check "TypeScript Tests (vitest)" npm run test:run

# ── Hard Gate 2: Rust Tests ────────────────────────────────────────────
# Exclude routa-desktop: requires display server (GTK/WebKit), can't run in Docker
run_check "Rust Tests (cargo test)" cargo test --workspace --exclude routa-desktop

# ── Hard Gate 3: API Contract Parity ───────────────────────────────────
run_check "API Contract Parity" npm run api:check

# ── Hard Gate 4: Lint ──────────────────────────────────────────────────
run_check "ESLint" npm run lint

# ── Summary ────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║                     FITNESS SUMMARY                         ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Passed: ${PASSED}${NC}"
echo -e "  ${RED}Failed: ${FAILED}${NC}"

if [ ${#FAILURES[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}Failed checks:${NC}"
    for f in "${FAILURES[@]}"; do
        echo -e "  ${RED}• ${f}${NC}"
    done
    echo ""
    exit 1
fi

echo ""
echo -e "${GREEN}All fitness checks passed! ✅${NC}"
echo ""

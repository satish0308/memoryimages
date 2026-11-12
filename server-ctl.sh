#!/usr/bin/env bash
# ==============================================================================
# MyMemoryPics Server Control CLI
# ------------------------------------------------------------------------------
# Manage the background server controller daemon.
# Usage:
#   ./server-ctl.sh start      - Start manager in background
#   ./server-ctl.sh stop       - Stop manager
#   ./server-ctl.sh restart    - Restart manager
#   ./server-ctl.sh status     - Check manager running state & URL
#   ./server-ctl.sh logs       - Tail manager logs
#   ./server-ctl.sh run        - Run manager in foreground
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SCRIPT_DIR}/manager/server.pid"
LOG_FILE="${SCRIPT_DIR}/manager/server.log"
SERVER_PY="${SCRIPT_DIR}/manager/server.py"

# Read MANAGER_PORT from .env if present
PORT=8080
if [ -f "${SCRIPT_DIR}/.env" ]; then
    ENV_PORT=$(grep -E "^MANAGER_PORT=" "${SCRIPT_DIR}/.env" | cut -d '=' -f2 | tr -d ' "' || true)
    if [ -n "$ENV_PORT" ]; then
        PORT="$ENV_PORT"
    fi
fi

is_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
        fi
    fi
    # Also check if process is running by name
    RUNNING_PID=$(pgrep -f "manager/server.py" | head -n 1 || true)
    if [ -n "$RUNNING_PID" ]; then
        echo "$RUNNING_PID" > "$PID_FILE"
        return 0
    fi
    return 1
}

case "$1" in
    start)
        if is_running; then
            echo "[INFO] MyMemoryPics Server Controller is already running (PID: $(cat "$PID_FILE"))."
            echo "       URL: http://localhost:${PORT}"
            exit 0
        fi

        echo "[INFO] Starting MyMemoryPics Server Controller on port ${PORT}..."
        nohup python3 "$SERVER_PY" --port "$PORT" > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        sleep 1

        if is_running; then
            echo "[OK] Server Controller started successfully! (PID: $(cat "$PID_FILE"))"
            echo "     Web UI: http://localhost:${PORT}"
            # Show local LAN IP if available
            LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
            if [ -n "$LAN_IP" ]; then
                echo "     LAN UI: http://${LAN_IP}:${PORT}"
            fi
        else
            echo "[ERROR] Failed to start Server Controller. Check logs: ${LOG_FILE}"
            cat "$LOG_FILE"
            exit 1
        fi
        ;;

    stop)
        if is_running; then
            PID=$(cat "$PID_FILE")
            echo "[INFO] Stopping Server Controller (PID: $PID)..."
            kill "$PID" || true
            sleep 1
            if ps -p "$PID" > /dev/null 2>&1; then
                kill -9 "$PID" || true
            fi
            rm -f "$PID_FILE"
            echo "[OK] Server Controller stopped."
        else
            echo "[INFO] Server Controller is not running."
        fi
        ;;

    restart)
        "$0" stop
        sleep 1
        "$0" start
        ;;

    status)
        if is_running; then
            PID=$(cat "$PID_FILE")
            echo "[RUNNING] Server Controller is active (PID: $PID)."
            echo "          Local URL: http://localhost:${PORT}"
            LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
            if [ -n "$LAN_IP" ]; then
                echo "          LAN URL:   http://${LAN_IP}:${PORT}"
            fi
            # Quick health probe
            if command -v curl >/dev/null 2>&1; then
                STATUS_JSON=$(curl -s --max-time 2 "http://localhost:${PORT}/api/status" || true)
                if [ -n "$STATUS_JSON" ]; then
                    SERVER_STATE=$(echo "$STATUS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin).get('state', 'unknown'))" 2>/dev/null || echo "active")
                    RUNNING_SVCS=$(echo "$STATUS_JSON" | python3 -c "import sys, json; d=json.load(sys.stdin); print(f\"{d.get('running_count',0)}/{d.get('total_services',0)}\")" 2>/dev/null || echo "unknown")
                    echo "          Containers: ${SERVER_STATE^^} (${RUNNING_SVCS} running)"
                fi
            fi
        else
            echo "[STOPPED] Server Controller is not running."
            echo "          To start: ./server-ctl.sh start"
        fi
        ;;

    logs)
        if [ -f "$LOG_FILE" ]; then
            tail -f "$LOG_FILE"
        else
            echo "No log file found at ${LOG_FILE}."
        fi
        ;;

    run)
        echo "[INFO] Running Server Controller in foreground..."
        python3 "$SERVER_PY" --port "$PORT"
        ;;

    *)
        echo "Usage: $0 {start|stop|restart|status|logs|run}"
        exit 1
        ;;
esac

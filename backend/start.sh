#!/bin/bash

# Kimi-K2 Chatbot Startup Script
# This script ensures Ollama is running and starts the backend server

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MODEL_NAME="${MODEL_NAME:-kimi-k2:1t-cloud}"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
MAX_WAIT_TIME=60  # Maximum time to wait for Ollama to start (seconds)

echo -e "${BLUE}Starting Kimi-K2 Chatbot Backend...${NC}"

# Function to check if Ollama is running
check_ollama() {
    curl -s "$OLLAMA_HOST/api/version" > /dev/null 2>&1
    return $?
}

# Function to check if Ollama command exists
check_ollama_installed() {
    command -v ollama >/dev/null 2>&1
    return $?
}

# Function to start Ollama
start_ollama() {
    echo -e "${YELLOW}Starting Ollama service...${NC}"
    
    # Start Ollama in background
    ollama serve > /tmp/ollama.log 2>&1 &
    OLLAMA_PID=$!
    
    echo "Ollama started with PID: $OLLAMA_PID"
    
    # Wait for Ollama to be ready
    echo -e "${YELLOW}Waiting for Ollama to be ready...${NC}"
    local waited=0
    while [ $waited -lt $MAX_WAIT_TIME ]; do
        if check_ollama; then
            echo -e "${GREEN}Ollama is ready!${NC}"
            return 0
        fi
        sleep 2
        waited=$((waited + 2))
        echo -n "."
    done
    
    echo -e "\n${RED}Timeout: Ollama failed to start within $MAX_WAIT_TIME seconds${NC}"
    return 1
}

# Function to check if model is available
check_model() {
    local model_name="$1"
    ollama list | grep -q "$model_name"
    return $?
}

# Function to pull model if not available
ensure_model() {
    local model_name="$1"
    echo -e "${YELLOW}Checking if model '$model_name' is available...${NC}"
    
    if check_model "$model_name"; then
        echo -e "${GREEN}Model '$model_name' is already available${NC}"
    else
        echo -e "${YELLOW}Model '$model_name' not found. Pulling from Ollama registry...${NC}"
        if ollama pull "$model_name"; then
            echo -e "${GREEN}Model '$model_name' pulled successfully${NC}"
        else
            echo -e "${RED}Failed to pull model '$model_name'${NC}"
            echo -e "${YELLOW}Available models:${NC}"
            ollama list
            return 1
        fi
    fi
}

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    if [ ! -z "$OLLAMA_PID" ]; then
        echo "Stopping Ollama (PID: $OLLAMA_PID)"
        kill $OLLAMA_PID 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Main execution
main() {
    # Check if Ollama is installed
    if ! check_ollama_installed; then
        echo -e "${RED}Error: Ollama is not installed${NC}"
        echo -e "${YELLOW}Please install Ollama from: https://ollama.ai/download${NC}"
        echo -e "${YELLOW}Or run: curl -fsSL https://ollama.ai/install.sh | sh${NC}"
        exit 1
    fi
    
    # Check if Ollama is already running
    if check_ollama; then
        echo -e "${GREEN}Ollama is already running${NC}"
    else
        # Start Ollama
        if ! start_ollama; then
            echo -e "${RED}Failed to start Ollama${NC}"
            exit 1
        fi
    fi
    
    # Ensure the model is available
    if ! ensure_model "$MODEL_NAME"; then
        echo -e "${RED}Failed to ensure model availability${NC}"
        exit 1
    fi
    
    # Start the Node.js server
    echo -e "${BLUE}Starting Node.js server...${NC}"
    exec node server.js
}

# Run main function
main "$@"
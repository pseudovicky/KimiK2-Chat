@echo off
REM Kimi-K2 Chatbot Startup Script for Windows
REM This script ensures Ollama is running and starts the backend server

setlocal enabledelayedexpansion

REM Configuration
set "MODEL_NAME=kimi-k2:1t-cloud"
if not "%MODEL_NAME%"=="" set "MODEL_NAME=%MODEL_NAME%"
set "OLLAMA_HOST=http://localhost:11434"
if not "%OLLAMA_HOST%"=="" set "OLLAMA_HOST=%OLLAMA_HOST%"
set "MAX_WAIT_TIME=60"

echo Starting Kimi-K2 Chatbot Backend...

REM Function to check if Ollama is running
:check_ollama
curl -s "%OLLAMA_HOST%/api/version" >nul 2>&1
if %errorlevel% equ 0 (
    exit /b 0
) else (
    exit /b 1
)

REM Function to check if Ollama is installed
:check_ollama_installed
where ollama >nul 2>&1
if %errorlevel% equ 0 (
    exit /b 0
) else (
    exit /b 1
)

REM Main execution
echo Checking if Ollama is installed...
call :check_ollama_installed
if %errorlevel% neq 0 (
    echo Error: Ollama is not installed
    echo Please install Ollama from: https://ollama.ai/download
    pause
    exit /b 1
)

echo Checking if Ollama is running...
call :check_ollama
if %errorlevel% equ 0 (
    echo Ollama is already running
    goto :ensure_model
)

echo Starting Ollama service...
start /b ollama serve
if %errorlevel% neq 0 (
    echo Failed to start Ollama
    pause
    exit /b 1
)

echo Waiting for Ollama to be ready...
set /a waited=0
:wait_loop
if !waited! geq %MAX_WAIT_TIME% (
    echo Timeout: Ollama failed to start within %MAX_WAIT_TIME% seconds
    pause
    exit /b 1
)

timeout /t 2 /nobreak >nul
call :check_ollama
if %errorlevel% equ 0 (
    echo Ollama is ready!
    goto :ensure_model
)

set /a waited=!waited!+2
echo .
goto :wait_loop

:ensure_model
echo Checking if model '%MODEL_NAME%' is available...
ollama list | findstr /c:"%MODEL_NAME%" >nul
if %errorlevel% equ 0 (
    echo Model '%MODEL_NAME%' is already available
) else (
    echo Model '%MODEL_NAME%' not found. Pulling from Ollama registry...
    ollama pull "%MODEL_NAME%"
    if %errorlevel% neq 0 (
        echo Failed to pull model '%MODEL_NAME%'
        echo Available models:
        ollama list
        pause
        exit /b 1
    )
    echo Model '%MODEL_NAME%' pulled successfully
)

echo Starting Node.js server...
node server.js

pause
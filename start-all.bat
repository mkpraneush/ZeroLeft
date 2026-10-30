@echo off
setlocal
echo ========================================================
echo Starting ZeroLeft (MongoDB + FastAPI Backend + Vite Web)
echo ========================================================

REM 1. Ensure MongoDB is running on port 27017
netstat -ano | findstr :27017 >nul
if %ERRORLEVEL% NEQ 0 (
    echo Starting MongoDB...
    if exist "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" (
        start /B "" "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" --dbpath "%USERPROFILE%\.mongodb_data" --wiredTigerCacheSizeGB 0.25 --bind_ip 127.0.0.1
    ) else (
        echo Warning: Default MongoDB path not found. Checking if service can be started...
        net start MongoDB 2>nul
    )
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] MongoDB is running on port 27017.
)

REM 2. Ensure Backend is running on port 8000
netstat -ano | findstr :8000 >nul
if %ERRORLEVEL% NEQ 0 (
    echo Starting Backend API on port 8000...
    start "ZeroLeft Backend" cmd /k "cd /d %~dp0backend && .\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] Backend API is already listening on port 8000.
)

REM 3. Start Vite Frontend
echo Starting Vite Frontend on port 5173...
start "ZeroLeft Frontend" cmd /k "cd /d %~dp0 && npm run dev"

timeout /t 2 /nobreak >nul
echo ========================================================
echo ZeroLeft is up and running!
echo Frontend: http://localhost:5173
echo Backend Docs: http://localhost:8000/docs
echo ========================================================
start http://localhost:5173


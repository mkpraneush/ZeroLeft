@echo off
setlocal
echo ========================================================
echo Starting ZeroLeft MongoDB and Backend API
echo ========================================================

REM Check if MongoDB is already listening on port 27017
netstat -ano | findstr :27017 >nul
if %ERRORLEVEL% NEQ 0 (
    echo Starting MongoDB...
    if exist "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" (
        start /B "" "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" --dbpath "%USERPROFILE%\.mongodb_data" --wiredTigerCacheSizeGB 0.25 --bind_ip 127.0.0.1
    ) else (
        net start MongoDB 2>nul
    )
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] MongoDB is already running on port 27017.
)

echo Starting FastAPI Backend on port 8000 ...
cd /d "%~dp0backend"
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000


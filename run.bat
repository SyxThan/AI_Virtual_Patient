@echo off
REM ============================================================
REM  AI Virtual Patient - chay ca backend (FastAPI) va frontend (Next.js)
REM  Cach dung: nhap dup run.bat, hoac go "run" trong thu muc goc repo.
REM  Moi phan mo trong mot cua so rieng; dong cua so do de dung no.
REM ============================================================
setlocal
cd /d "%~dp0"

REM Doi cong: "set API_PORT=8001" truoc khi chay (web goi API theo NEXT_PUBLIC_API_URL).
if not defined API_PORT set "API_PORT=8000"
if not defined WEB_PORT set "WEB_PORT=3000"

where python >nul 2>&1 || (echo [LOI] Khong tim thay python trong PATH. & pause & exit /b 1)
where npm >nul 2>&1 || (echo [LOI] Khong tim thay npm trong PATH. Cai Node.js truoc. & pause & exit /b 1)

if not exist "apps\api\.env" echo [CANH BAO] Thieu apps\api\.env - API se chay voi cau hinh mac dinh. Xem .env.example.
if not exist "apps\web\.env.local" echo [CANH BAO] Thieu apps\web\.env.local - web se khong dang nhap duoc.

REM Bao truoc neu cong da co tien trinh khac dang dung (vi du da chay run.bat roi).
netstat -ano | findstr /R /C:":%API_PORT% .*LISTENING" >nul && echo [CANH BAO] Cong %API_PORT% dang duoc dung - co the API da chay san.
netstat -ano | findstr /R /C:":%WEB_PORT% .*LISTENING" >nul && echo [CANH BAO] Cong %WEB_PORT% dang duoc dung - co the web da chay san.

REM Cai thu vien web lan dau (chi khi chua co node_modules).
if not exist "apps\web\node_modules" (
  echo Dang cai thu vien cho web lan dau [npm install]...
  pushd "apps\web"
  call npm install
  if errorlevel 1 (popd & echo [LOI] npm install that bai. & pause & exit /b 1)
  popd
)

echo Khoi dong API tai http://127.0.0.1:%API_PORT% ...
start "AVP API :%API_PORT%" /D "%~dp0apps\api" cmd /k python -m uvicorn avp_api.main:app --reload --host 127.0.0.1 --port %API_PORT%

echo Khoi dong web tai http://localhost:%WEB_PORT% ...
start "AVP Web :%WEB_PORT%" /D "%~dp0apps\web" cmd /k npm run dev -- --port %WEB_PORT%

REM Doi web khoi dong roi mo trinh duyet.
if not defined NO_BROWSER (
  timeout /t 8 /nobreak >nul
  start "" "http://localhost:%WEB_PORT%"
)

echo.
echo Da mo 2 cua so: "AVP API" va "AVP Web". Dong tung cua so de dung.
endlocal

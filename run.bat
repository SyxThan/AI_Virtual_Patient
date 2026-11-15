@echo off
REM ============================================================
REM  AI Virtual Patient - chay ca backend (FastAPI) va frontend (Next.js)
REM  Cach dung: nhap dup run.bat, hoac go "run" trong thu muc goc repo.
REM  Moi phan mo trong mot cua so rieng; dong cua so do de dung no.
REM  Giong noi VieNeu-TTS (Slice 16): mo them cua so thu 3 khi apps\api\.env co
REM    TTS_PROVIDER=vieneu  va  VIENEU_DIR=<thu muc cai VieNeu-TTS> (xem README).
REM  Micro tai may (Slice 17): mo them cua so STT khi apps\api\.env co
REM    STT_PROVIDER=whisper, STT_MODEL va STT_SERVER_PYTHON (xem README).
REM  Thu ma khong khoi dong gi: "set DRY_RUN=1" roi chay run.bat (chi in lenh).
REM ============================================================
setlocal
cd /d "%~dp0"

REM Doi cong: "set API_PORT=8001" truoc khi chay (web goi API theo NEXT_PUBLIC_API_URL).
if not defined API_PORT set "API_PORT=8000"
if not defined WEB_PORT set "WEB_PORT=3000"
REM Cong VieNeu phai khop TTS_BASE_URL trong apps\api\.env (mac dinh 8880).
if not defined VIENEU_PORT set "VIENEU_PORT=8880"
REM Cong server STT phai khop STT_BASE_URL trong apps\api\.env (mac dinh 8890).
if not defined STT_PORT set "STT_PORT=8890"
set "LAUNCH=start"
if defined DRY_RUN set "LAUNCH=echo [DRY_RUN] start"

where python >nul 2>&1 || (echo [LOI] Khong tim thay python trong PATH. & pause & exit /b 1)
where npm >nul 2>&1 || (echo [LOI] Khong tim thay npm trong PATH. Cai Node.js truoc. & pause & exit /b 1)

if not exist "apps\api\.env" echo [CANH BAO] Thieu apps\api\.env - API se chay voi cau hinh mac dinh. Xem .env.example.
if not exist "apps\web\.env.local" echo [CANH BAO] Thieu apps\web\.env.local - web se khong dang nhap duoc.

REM Bao truoc neu cong da co tien trinh khac dang dung (vi du da chay run.bat roi).
netstat -ano | findstr /R /C:":%API_PORT% .*LISTENING" >nul && echo [CANH BAO] Cong %API_PORT% dang duoc dung - co the API da chay san.
netstat -ano | findstr /R /C:":%WEB_PORT% .*LISTENING" >nul && echo [CANH BAO] Cong %WEB_PORT% dang duoc dung - co the web da chay san.

REM Cai thu vien web lan dau (chi khi chua co node_modules).
if defined DRY_RUN goto after_install
if not exist "apps\web\node_modules" (
  echo Dang cai thu vien cho web lan dau [npm install]...
  pushd "apps\web"
  call npm install
  if errorlevel 1 (popd & echo [LOI] npm install that bai. & pause & exit /b 1)
  popd
)
:after_install

REM ---- VieNeu-TTS: doc TTS_PROVIDER, VIENEU_DIR, VIENEU_HF_HOME tu apps\api\.env ----
set "VIENEU_ON="
set "VIENEU_STARTED="
if exist "apps\api\.env" findstr /B /I /C:"TTS_PROVIDER=vieneu" "apps\api\.env" >nul && set "VIENEU_ON=1"
if not defined VIENEU_ON goto after_vieneu
if not defined VIENEU_DIR for /f "usebackq tokens=1,* delims==" %%A in (`findstr /B /C:"VIENEU_DIR=" "apps\api\.env"`) do set "VIENEU_DIR=%%B"
if not defined VIENEU_HF_HOME for /f "usebackq tokens=1,* delims==" %%A in (`findstr /B /C:"VIENEU_HF_HOME=" "apps\api\.env"`) do set "VIENEU_HF_HOME=%%B"
if not defined VIENEU_DIR goto vieneu_no_dir
if not exist "%VIENEU_DIR%\apps\openai_speech.py" goto vieneu_bad_dir
where uv >nul 2>&1 || goto vieneu_no_uv
netstat -ano | findstr /R /C:":%VIENEU_PORT% .*LISTENING" >nul && goto vieneu_busy
REM Model VieNeu (khoang 600 MB) tai ve HF_HOME; dat VIENEU_HF_HOME neu o C it cho trong.
if defined VIENEU_HF_HOME set "HF_HOME=%VIENEU_HF_HOME%"
echo Khoi dong VieNeu-TTS tai http://127.0.0.1:%VIENEU_PORT% (lan dau co the phai tai model)...
%LAUNCH% "AVP VieNeu :%VIENEU_PORT%" /D "%VIENEU_DIR%" cmd /k "set HOST=127.0.0.1&& set PORT=%VIENEU_PORT%&& uv run --no-sync python -m apps.openai_speech"
set "VIENEU_STARTED=1"
goto after_vieneu
:vieneu_no_dir
echo [CANH BAO] TTS_PROVIDER=vieneu nhung apps\api\.env chua co VIENEU_DIR - khong mo VieNeu.
goto after_vieneu
:vieneu_bad_dir
echo [CANH BAO] Khong thay VieNeu-TTS tai "%VIENEU_DIR%" - kiem tra VIENEU_DIR.
goto after_vieneu
:vieneu_no_uv
echo [CANH BAO] Khong tim thay uv trong PATH - khong mo VieNeu.
goto after_vieneu
:vieneu_busy
echo [CANH BAO] Cong %VIENEU_PORT% dang duoc dung - co the VieNeu da chay san.
:after_vieneu

REM ---- Micro tai may (Slice 17): STT_PROVIDER, STT_MODEL, STT_SERVER_PYTHON, STT_HF_HOME ----
set "STT_ON="
set "STT_STARTED="
if exist "apps\api\.env" findstr /B /I /C:"STT_PROVIDER=whisper" "apps\api\.env" >nul && set "STT_ON=1"
if not defined STT_ON goto after_stt
if not defined WHISPER_MODEL for /f "usebackq tokens=1,* delims==" %%A in (`findstr /B /C:"STT_MODEL=" "apps\api\.env"`) do set "WHISPER_MODEL=%%B"
if not defined STT_SERVER_PYTHON for /f "usebackq tokens=1,* delims==" %%A in (`findstr /B /C:"STT_SERVER_PYTHON=" "apps\api\.env"`) do set "STT_SERVER_PYTHON=%%B"
if not defined STT_HF_HOME for /f "usebackq tokens=1,* delims==" %%A in (`findstr /B /C:"STT_HF_HOME=" "apps\api\.env"`) do set "STT_HF_HOME=%%B"
if not defined WHISPER_MODEL goto stt_no_model
if not defined STT_SERVER_PYTHON goto stt_no_python
if not exist "%STT_SERVER_PYTHON%" goto stt_bad_python
netstat -ano | findstr /R /C:":%STT_PORT% .*LISTENING" >nul && goto stt_busy
REM HF_HOME chi dat trong cua so STT (khong anh huong VieNeu hay API).
set "STT_ENV=set PYTHONUTF8=1&& set WHISPER_MODEL=%WHISPER_MODEL%&& set STT_SERVER_PORT=%STT_PORT%"
if defined STT_HF_HOME set "STT_ENV=%STT_ENV%&& set HF_HOME=%STT_HF_HOME%"
echo Khoi dong server STT (model %WHISPER_MODEL%) tai http://127.0.0.1:%STT_PORT% (lan dau co the phai tai model)...
%LAUNCH% "AVP STT :%STT_PORT%" /D "%~dp0scripts\stt_server" cmd /k "%STT_ENV%&& "%STT_SERVER_PYTHON%" server.py"
set "STT_STARTED=1"
goto after_stt
:stt_no_model
echo [CANH BAO] STT_PROVIDER=whisper nhung apps\api\.env chua co STT_MODEL (vi du small) - khong mo server STT.
goto after_stt
:stt_no_python
echo [CANH BAO] STT_PROVIDER=whisper nhung apps\api\.env chua co STT_SERVER_PYTHON - khong mo server STT.
goto after_stt
:stt_bad_python
echo [CANH BAO] Khong thay "%STT_SERVER_PYTHON%" - kiem tra STT_SERVER_PYTHON (xem README).
goto after_stt
:stt_busy
echo [CANH BAO] Cong %STT_PORT% dang duoc dung - co the server STT da chay san.
:after_stt

echo Khoi dong API tai http://127.0.0.1:%API_PORT% ...
%LAUNCH% "AVP API :%API_PORT%" /D "%~dp0apps\api" cmd /k python -m uvicorn avp_api.main:app --reload --host 127.0.0.1 --port %API_PORT%

echo Khoi dong web tai http://localhost:%WEB_PORT% ...
%LAUNCH% "AVP Web :%WEB_PORT%" /D "%~dp0apps\web" cmd /k npm run dev -- --port %WEB_PORT%

REM Doi web khoi dong roi mo trinh duyet.
if defined DRY_RUN set "NO_BROWSER=1"
if not defined NO_BROWSER (
  timeout /t 8 /nobreak >nul
  start "" "http://localhost:%WEB_PORT%"
)

echo.
set "WINDOWS="
if defined STT_STARTED set "WINDOWS=%WINDOWS%"AVP STT", "
if defined VIENEU_STARTED set "WINDOWS=%WINDOWS%"AVP VieNeu", "
echo Da mo cac cua so: %WINDOWS%"AVP API" va "AVP Web". Dong tung cua so de dung.
endlocal

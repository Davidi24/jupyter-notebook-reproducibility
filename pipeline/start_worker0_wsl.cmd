@echo off
setlocal
cd /d C:\David\Work\ma-david-keci
if not exist output\launcher mkdir output\launcher
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set RUN_STAMP=%%i
set RUN_DIR_WIN=output\launcher\manual-worker0-%RUN_STAMP%
set RUN_DIR_WSL=output/launcher/manual-worker0-%RUN_STAMP%
mkdir "%RUN_DIR_WIN%"
wsl.exe -e bash -lc "cd /mnt/c/David/Work/ma-david-keci && env WORKER_COUNT=2 WORKER_INDEX=0 LIMIT=0 CLASSIFICATION_ENABLED=false bash pipeline/run_full_sample_v7.sh > '%RUN_DIR_WSL%/worker0.out' 2>&1"

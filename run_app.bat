@echo off
echo Starting Backend...
start "VideoTools Backend" /D "backend" .venv\Scripts\uvicorn main:app --reload --port 5555

echo Starting Frontend...
cd frontend
npm run dev

@echo off
echo Starting Backend...
start "VideoTools Backend" /D "backend" .venv\Scripts\uvicorn main:app --reload

echo Starting Frontend...
cd frontend
npm run dev

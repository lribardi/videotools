from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import shutil
import json
from services.video_processor import VideoProcessor
from services.ai_verifier import AIVerifier

app = FastAPI()

# ... (middleware remains the same)

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

video_processor = VideoProcessor()
# Lazy load AI verifier to avoid startup lag or if unused
ai_verifier = None # AIVerifier() 

class VideoRequest(BaseModel):
    path: str
    threshold: float = 27.0
    use_ai: bool = False

class Scene(BaseModel):
    start: float
    end: float
    scene_number: int

class AnalysisResponse(BaseModel):
    video_path: str
    scenes: List[Scene]

class SplitRequest(BaseModel):
    video_path: str
    scenes: List[Scene]

@app.get("/")
async def root():
    return {"message": "Video Splitter API is running"}

@app.post("/api/analyze")
async def analyze_video(request: VideoRequest):
    if not os.path.exists(request.path):
        raise HTTPException(status_code=404, detail="File not found")
    
    print(f"Analyzing {request.path} with threshold {request.threshold}")
    
    async def event_generator():
        try:
            # We need to run the blocking call in a way that allows yielding.
            # However, detect_scenes is blocking. To stream updates, we'd typically need
            # to run it in a thread and communicate via a queue, OR just yield updates 
            # if the callback can somehow signal back.
            # Actually, standard generators in FastAPI run in Sync worker thread?
            # No, if I define main endpoint as async, I must await. 
            # If I define it as def, it runs in threadpool but cannot yield StreamingResponse easily?
            # Actually StreamingResponse accepts an iterator. The iterator can be a generator.
            
            # Since detect_scenes takes a callback, we can't easily "yield" from inside the callback 
            # to the HTTP response generator unless we restructure.
            # EASIER APPROACH for local tool:
            # Just yield "progress" events from the loop IF we can control the loop.
            # But scenedetect controls the loop.
            
            # Hybrid approach: Use a queue.
            import queue
            q = queue.Queue()
            
            def progress_callback(percent, fps=0.0, eta=0.0, scenes=0):
                q.put({"type": "progress", "value": percent, "fps": fps, "eta": eta, "scenes": scenes})
            
            # Run detection in a separate thread
            import threading
            result_container = {}
            
            def run_detection():
                try:
                    scenes = video_processor.detect_scenes(request.path, request.threshold, callback=progress_callback)
                    result_container['data'] = scenes
                except Exception as ex:
                    result_container['error'] = str(ex)
                finally:
                    q.put(None) # Signal done
            
            t = threading.Thread(target=run_detection)
            t.start()
            
            while True:
                # Non-blocking check or small timeout
                try:
                    item = q.get(timeout=0.1)
                    if item is None:
                        break
                    yield json.dumps(item) + "\n"
                except queue.Empty:
                    if not t.is_alive():
                        print("DEBUG: Thread died, breaking loop")
                        break
                    continue
            
            t.join()
            print("DEBUG: Thread joined.")
            
            if 'error' in result_container:
                print(f"DEBUG: Error in result: {result_container['error']}")
                yield json.dumps({"type": "error", "message": result_container['error']}) + "\n"
            else:
                formatted_scenes = []
                # Check if data exists
                if 'data' not in result_container:
                     print("DEBUG: No data in result container! Thread must have failed silently.")
                     yield json.dumps({"type": "error", "message": "Internal Error: No data produced."}) + "\n"
                else:
                    print(f"DEBUG: Yielding complete message with {len(result_container['data'])} scenes")
                    for i, (start, end) in enumerate(result_container['data']):
                        formatted_scenes.append({"start": start, "end": end, "scene_number": i+1})
                    
                    yield json.dumps({
                        "type": "complete", 
                        "video_path": request.path, 
                        "scenes": formatted_scenes
                    }) + "\n"
                    print("DEBUG: Complete message yielded")
                
        except Exception as e:
            print(f"DEBUG: Generator Exception: {e}")
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

@app.post("/api/split")
async def split_video(request: SplitRequest):
    if not os.path.exists(request.video_path):
        raise HTTPException(status_code=404, detail="Video file not found")
        
    output_dir = os.path.splitext(request.video_path)[0]
    
    async def event_generator():
        try:
            # Same pattern for splitting
            import queue
            import threading
            q = queue.Queue()
            
            def progress_callback(percent):
                q.put({"type": "progress", "value": percent})
                
            result_container = {}
            
            def run_split():
                try:
                    files = video_processor.split_video(
                        request.video_path, 
                        [(s.start, s.end) for s in request.scenes],
                        output_dir,
                        callback=progress_callback
                    )
                    result_container['data'] = files
                except Exception as ex:
                    result_container['error'] = str(ex)
                finally:
                    q.put(None)
            
            t = threading.Thread(target=run_split)
            t.start()
            
            while True:
                try:
                    item = q.get(timeout=0.1)
                    if item is None:
                        break
                    yield json.dumps(item) + "\n"
                except queue.Empty:
                    if not t.is_alive():
                        break
                    continue
                    
            t.join()
            
            if 'error' in result_container:
                yield json.dumps({"type": "error", "message": result_container['error']}) + "\n"
            else:
                yield json.dumps({
                    "type": "complete",
                    "files": result_container['data'],
                    "output_dir": output_dir
                }) + "\n"
                
        except Exception as e:
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"
    
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

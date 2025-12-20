import os
import subprocess
import shutil
from typing import List, Tuple
from scenedetect import detect, ContentDetector, SceneManager, open_video, split_video_ffmpeg
from scenedetect.scene_manager import save_images, compute_downscale_factor

class VideoProcessor:
    def __init__(self):
        if not shutil.which('ffmpeg'):
            raise RuntimeError("FFmpeg not found in PATH. Please install FFmpeg (e.g. 'winget install Gyan.FFmpeg') and restart the application.")

    def detect_scenes(self, video_path: str, threshold: float = 27.0, callback=None) -> List[Tuple[float, float]]:
        """
        Detects scenes in a video using content detection.
        Returns a list of (start_time, end_time) tuples in seconds.
        """
        video = open_video(video_path)
        scene_manager = SceneManager()
        scene_manager.add_detector(ContentDetector(threshold=threshold))
        scene_manager._base_timecode = video.base_timecode
        scene_manager._start_pos = video.base_timecode
        if scene_manager._start_pos is None:
             from scenedetect import FrameTimecode
             scene_manager._start_pos = FrameTimecode(0, video.frame_rate)
        
        # Get total frames for progress calculation
        # Note: video.duration is a FrameTimecode object which uses .get_frames()
        total_frames = 0
        if hasattr(video.duration, 'get_frames'):
            total_frames = video.duration.get_frames()
        elif hasattr(video.duration, 'frame_count'):
            total_frames = video.duration.frame_count

        # Calculate downscale factor (mimic detect_scenes behavior)
        # SceneManager default auto_downscale=True
        # We need to replicate this logic because _process_frame() expects the USER to handle it if calling manually
        effective_frame_size = video.frame_size
        downscale_factor = compute_downscale_factor(max(effective_frame_size))
        
        import time
        start_time = time.time()
        import cv2

        frame_num = 0
        
        while True:
            frame = video.read()
            # Handle termination: None or explicit False (some adapters return False on EOF)
            if frame is None:
                break
            if isinstance(frame, bool) and not frame:
                break
            
            # Apply Downscaling (Standard Logic)
            if downscale_factor > 1.0:
                frame_im = cv2.resize(
                    frame,
                    (
                        max(1, round(frame.shape[1] / downscale_factor)),
                        max(1, round(frame.shape[0] / downscale_factor)),
                    ),
                    interpolation=cv2.INTER_LINEAR,
                )
            else:
                frame_im = frame
            
            # Use internal _process_frame since public API seems to lack simple frame feed in this version
            # or it's hidden. This affords us granular progress control.
            scene_manager._process_frame(frame_num, frame_im)
            
            frame_num += 1
            
            if callback and total_frames > 0 and frame_num % 30 == 0: # Update every ~30 frames
                current_time = time.time()
                elapsed = current_time - start_time
                fps = frame_num / elapsed if elapsed > 0 else 0
                
                remaining_frames = total_frames - frame_num
                eta = remaining_frames / fps if fps > 0 else 0
                
                progress = min(100, int((frame_num / total_frames) * 100))
                
                # Get number of cuts found so far
                # _cutting_list contains timecodes of cuts. # of scenes = # of cuts + 1 (usually, or 0 if empty)
                # Actually, detect_scenes source uses len(_cutting_list) to update progress bar. 
                # Ideally we want "Scenes Found". 
                num_cuts = len(scene_manager._cutting_list)
                num_scenes_so_far = num_cuts + 1 if num_cuts > 0 or frame_num > 60 else 0 # Rough estimate
                if num_cuts == 0:
                     num_scenes_so_far = 0
                else: 
                     num_scenes_so_far = num_cuts + 1

                # Try passing tuple or dict if callback supports it, 
                # but standard callback usually takes 1 arg. 
                # We control the callback in main.py, so we can change signature.
                callback(progress, fps, eta, num_scenes_so_far)
        
        # Signal 100% done
        if callback:
             final_scenes = len(scene_manager._cutting_list) + 1 if len(scene_manager._cutting_list) > 0 else 0
             callback(100, 0.0, 0.0, final_scenes)
             
        # Post-process (required in some modes, good practice)
        # Manually construct last position to avoid potential NoneType from video.position at EOF
        if video.base_timecode:
             scene_manager._last_pos = video.base_timecode + frame_num
        else:
             # Fallback if base_timecode is somehow missing (unlikely with open_video)
             from scenedetect import FrameTimecode
             scene_manager._last_pos = FrameTimecode(frame_num, video.frame_rate)
             
        scene_manager._post_process(frame_num)

        scene_list = scene_manager.get_scene_list()
        
        # Convert to seconds tuples
        scenes_seconds = []
        for scene in scene_list:
            start, end = scene
            scenes_seconds.append((start.get_seconds(), end.get_seconds()))
            
        return scenes_seconds

    def split_video(self, video_path: str, scenes: List[Tuple[float, float]], output_dir: str, callback=None):
        """
        Splits the video into segments based on scene timings.
        """
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        filename = os.path.basename(video_path)
        name, ext = os.path.splitext(filename)
        
        created_files = []
        total_scenes = len(scenes)
        
        # Get frame rate for precise offset calculation
        # We need to open the video to get stats
        try:
             video = open_video(video_path)
             fps = video.frame_rate
             frame_duration = 1.0 / fps if fps > 0 else 0.033
        except:
             frame_duration = 0.033 # Fallback 30fps

        # Force MP4 output for web/immich compatibility
        # H.264 in AVI is problematic, and 'faststart' only works with MP4/MOV.
        ext = ".mp4"

        for i, (start, end) in enumerate(scenes):
            output_file = os.path.join(output_dir, f"{name}_scene_{i+1:03d}{ext}")
            
            # Switch to re-encoding to fix keyframe issues (black screen) and overlap.
            # -c:v libx264 -preset fast -crf 23: Good balance of speed and quality.
            # -c:a copy: Copy audio to avoid quality loss there (unless it causes sync issues, then aac).
            # -ss before -i: Fast seek. With re-encoding, ffmpeg decodes from previous keyframe but drops frames until -ss, ensuring clean start.
            
            # FIX: Add tiny offset to start time (e.g. 0.5 frame) to prevent ffmpeg from 
            # picking up the last frame of the PREVIOUS scene due to rounding errors,
            # which ruins thumbnails. 
            # Only apply to 2nd scene onwards (i > 0)
            adj_start = start
            if i > 0:
                adj_start = start + (frame_duration * 0.5)

            cmd = [
                'ffmpeg', '-y',
                '-ss', f"{adj_start:.3f}",
                '-i', video_path,
                '-t', str(end - start),
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '22',
                '-pix_fmt', 'yuv420p', # Ensure wide compatibility (prevent flickering in some web players)
                '-movflags', '+faststart', # Web optimization
                '-c:a', 'aac', # Re-encode audio too to ensure timestamp sync
                output_file
            ]
            
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            created_files.append(output_file)
            
            if callback:
                progress = int(((i + 1) / total_scenes) * 100)
                callback(progress)
            
        return created_files

    def generate_thumbnail(self, video_path: str, time: float) -> bytes:
        """
        Generates a JPEG thumbnail for the video at the specified time.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError("Video file not found")

        # Add a small offset to ensures we capture a frame INSIDE the scene,
        # rather than safely on the boundary (which might round down to previous scene).
        # 0.1s is safe for most frame rates (steps ~2-6 frames in).
        adj_time = time + 0.1
        
        # ffmpeg -ss {time} -i {path} -vframes 1 -vf scale=200:-1 -f image2 pipe:1
        cmd = [
            'ffmpeg',
            '-ss', str(adj_time),
            '-i', video_path,
            '-vframes', '1',
            '-vf', 'scale=200:-1', # Width 200, maintain aspect ratio
            '-f', 'image2',
            'pipe:1'
        ]
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        output, _ = process.communicate()
        if process.returncode != 0:
            raise RuntimeError("FFmpeg failed to generate thumbnail")
            
        return output

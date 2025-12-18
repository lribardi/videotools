import os
import subprocess
import shutil
from typing import List, Tuple
from scenedetect import detect, ContentDetector, SceneManager, open_video, split_video_ffmpeg
from scenedetect.scene_manager import save_images

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
        
        # Get total frames for progress calculation
        # Note: video.duration is a FrameTimecode object which uses .get_frames()
        total_frames = 0
        if hasattr(video.duration, 'get_frames'):
            total_frames = video.duration.get_frames()
        elif hasattr(video.duration, 'frame_count'):
            total_frames = video.duration.frame_count

        # Manual iteration to support progress callback
        # We need to process frames one by one
        frame_num = 0
        while True:
            frame = video.read()
            if frame is None:
                break
            
            # Use internal _process_frame since public API seems to lack simple frame feed in this version
            # or it's hidden. This affords us granular progress control.
            scene_manager._process_frame(frame_num, frame)
            
            frame_num += 1
            
            if callback and total_frames > 0 and frame_num % 30 == 0: # Update every ~30 frames
                progress = min(100, int((frame_num / total_frames) * 100))
                callback(progress)
        
        # Signal 100% done
        if callback:
             callback(100)
             
        # Post-process (required in some modes, good practice)
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
        
        for i, (start, end) in enumerate(scenes):
            output_file = os.path.join(output_dir, f"{name}_scene_{i+1:03d}{ext}")
            
            # Switch to re-encoding to fix keyframe issues (black screen) and overlap.
            # -c:v libx264 -preset fast -crf 23: Good balance of speed and quality.
            # -c:a copy: Copy audio to avoid quality loss there (unless it causes sync issues, then aac).
            # -ss before -i: Fast seek. With re-encoding, ffmpeg decodes from previous keyframe but drops frames until -ss, ensuring clean start.
            
            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start),
                '-i', video_path,
                '-t', str(end - start),
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '22',
                '-c:a', 'aac', # Re-encode audio too to ensure timestamp sync
                output_file
            ]
            
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            created_files.append(output_file)
            
            if callback:
                progress = int(((i + 1) / total_scenes) * 100)
                callback(progress)
            
        return created_files

    def get_scene_images(self, video_path: str, scenes: List[Tuple[float, float]]) -> List[Tuple[str, str]]:
        pass

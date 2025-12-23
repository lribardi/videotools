import os
import shutil
import base64
import ollama
import math
import io
from PIL import Image, ImageDraw, ImageFont
from typing import List, Dict, Any, Tuple
from .video_processor import VideoProcessor

class VideoGrouper:
    def __init__(self):
        self.video_processor = VideoProcessor()
        self.output_dir = "temp_thumbnails"
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

    def _create_image_grid(self, image_paths: List[str]) -> str:
        """
        Stitches images into a grid and returns the path to the stitched image.
        Adds number labels to each image.
        """
        images = [Image.open(p) for p in image_paths]
        if not images:
            return ""

        n = len(images)
        cols = 3
        rows = math.ceil(n / cols)
        
        # Assume all thumbnails are roughly same size (from ffmpeg scale=200:-1)
        w, h = images[0].size
        
        # Create canvas
        grid_w = cols * w
        grid_h = rows * h
        canvas = Image.new('RGB', (grid_w, grid_h), color=(0,0,0))
        
        draw = ImageDraw.Draw(canvas)
        
        # Try to load a font, fallback to default
        try:
            # Linux/Mac path logic omitted, focusing on basic win/default
            font = ImageFont.truetype("arial.ttf", 20) 
        except:
            font = ImageFont.load_default()

        for idx, img in enumerate(images):
            # Calculate position
            c = idx % cols
            r = idx // cols
            x = c * w
            y = r * h
            
            # Resize if slightly different (just in case)
            if img.size != (w, h):
                img = img.resize((w, h))
                
            canvas.paste(img, (x, y))
            
            # Draw Label "1", "2", etc.
            label = str(idx + 1)
            
            # Draw semi-transparent box for text
            text_x = x + 5
            text_y = y + 5
            # Simplified box drawing
            draw.rectangle([text_x, text_y, text_x + 30, text_y + 30], fill=(0, 0, 0, 128))
            draw.text((text_x + 10, text_y + 5), label, fill=(255, 255, 255), font=font)

        out_path = os.path.join(self.output_dir, "grid_stitch.jpg")
        canvas.save(out_path)
        return out_path

    def group_scenes(self, video_path: str, scenes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Groups scenes using Llama 3.2 Vision.
        Strategy: Stitch batch of 9 images into ONE grid to avoid multi-image limitation.
        """
        if not scenes:
            return []
            
        print(f"Starting AI grouping for {len(scenes)} scenes...")
        
        BATCH_SIZE = 9
        processed_scenes = [s.copy() for s in scenes]
        group_id_offset = 0
        num_batches = math.ceil(len(processed_scenes) / BATCH_SIZE)
        
        for i in range(num_batches):
            batch_start = i * BATCH_SIZE
            batch_end = min((i + 1) * BATCH_SIZE, len(processed_scenes))
            batch_indices = range(batch_start, batch_end)
            
            print(f"Processing batch {i+1}/{num_batches} (Scenes {batch_start+1}-{batch_end})")
            
            thumbnails = []
            
            for idx in batch_indices:
                scene = processed_scenes[idx]
                mid_point = (scene['start'] + scene['end']) / 2
                try:
                    thumb_data = self.video_processor.generate_thumbnail(video_path, mid_point)
                    fname = os.path.join(self.output_dir, f"scene_{idx}.jpg")
                    with open(fname, 'wb') as f:
                        f.write(thumb_data)
                    thumbnails.append(fname)
                except Exception as e:
                    print(f"Error generating thumbnail for scene {idx}: {e}")
                    pass

            if not thumbnails:
                continue

            # Stitch into single image
            stitched_image_path = self._create_image_grid(thumbnails)
            if not stitched_image_path:
                print("Failed to stitch image.")
                continue

            # 2. Query AI with SINGLE image
            try:
                # Prompt adjusted for grid
                prompt = (
                    f"You are a professional film editor. The image provided contains {len(thumbnails)} numbered scenes in a grid. "
                    "Group them into logical events or locations based on visual similarity and narrative context. "
                    "Return the result strictly as a valid JSON list of lists of indices (the numbers shown on the images). "
                    "Example: [[1, 2], [3], [4, 5, 6]]. "
                    "Ensure every index from 1 to " + str(len(thumbnails)) + " is included exactly once."
                )

                response = ollama.chat(model='llama3.2-vision', messages=[
                    {
                        'role': 'user',
                        'content': prompt,
                        'images': [stitched_image_path] # ONE image now
                    }
                ])
                
                content = response['message']['content']
                print(f"AI Response: {content}")
                
                import re
                json_match = re.search(r'\[.*\]', content, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                    import json
                    groups = json.loads(json_str)
                    
                    for group in groups:
                        group_id_offset += 1
                        current_gid = group_id_offset
                        
                        for local_idx in group:
                            if isinstance(local_idx, int):
                                # Convert 1-based local index to 0-based global index
                                global_idx = batch_start + (local_idx - 1)
                                if global_idx < len(processed_scenes):
                                    processed_scenes[global_idx]['group_id'] = current_gid
                                    
                else:
                     print("Could not parse JSON from AI response.")
                     
            except Exception as e:
                print(f"AI Grouping Error: {e}")
                
        return processed_scenes

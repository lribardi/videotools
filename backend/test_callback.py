from scenedetect import detect, ContentDetector, SceneManager, open_video
import sys

def test_callback():
    video_path = "C:/Users/laure/Videos/test.mp4" # Placeholder, user has to edit or I need to find a video.
    # Actually I don't know a video path. I'll just look for one or ask user. 
    # Or I can just check the generic imports and try to mock? 
    # No, let's just make the script require an argument.
    
    if len(sys.argv) < 2:
        print("Usage: python test_callback.py <video_path>")
        return

    video_path = sys.argv[1]
    print(f"Testing callback on {video_path}")

    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector())

    def my_callback(image, frame_num):
        print(f"Callback called! Frame: {frame_num}")
        # Stop early to save time
        if frame_num > 100:
            return

    try:
        print("Starting detection...")
        # Try expected signature
        scene_manager.detect_scenes(video, show_progress=False, callback=my_callback)
        print("Detection finished.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_callback()

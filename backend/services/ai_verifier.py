import ollama
import os

class AIVerifier:
    def __init__(self, model: str = "llama3.2-vision"):
        self.model = model

    def verify_scene_change(self, image_path_a: str, image_path_b: str) -> bool:
        """
        Uses Ollama Vision model to check if two images represent a scene change.
        Returns True if it IS a scene change, False otherwise.
        """
        try:
            # We will send both images and ask for comparison.
            # Llama 3.2 Vision supports multiple images? 
            # If not, we might need to stitch them or describe them separately.
            # Assuming Llama 3.2 Vision supports multiple images in one message.
            
            response = ollama.chat(model=self.model, messages=[
                {
                    'role': 'user',
                    'content': 'Are these two images from the same continuous scene or is there a cut/scene change between them? Reply ONLY with "SAME SCENE" or "SCENE CHANGE".',
                    'images': [image_path_a, image_path_b]
                }
            ])
            
            answer = response['message']['content'].upper()
            
            print(f"AI Verification: {answer}")
            
            if "SCENE CHANGE" in answer:
                return True
            return False
            
        except Exception as e:
            print(f"Error in AI verification: {e}")
            # Fallback: Assume it IS a scene change if detector said so? 
            # Or assume NOT?
            # If AI fails, trust the initial detector.
            return True

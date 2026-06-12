from .image_loader import mAI_ImageLoader
from .main_input_v02 import mAI_MainInputV02


NODE_CLASS_MAPPINGS = {
    "mAI_MainInputV02": mAI_MainInputV02,
    "mAI_ImageLoader": mAI_ImageLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "mAI_MainInputV02": "🔣 mAI MainInput V02",
    "mAI_ImageLoader": "🖼️ mAI ImageLoader",
}


__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]

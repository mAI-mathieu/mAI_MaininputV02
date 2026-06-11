import unittest

from utils.image_loader import _resolve_image_path


class ImageLoaderTests(unittest.TestCase):
    def test_mask_override_image_rejects_absolute_path_with_clear_message(self):
        path = r"C:\temp\ComfyUI_temp_ysadp_00001_.png"

        with self.assertRaises(ValueError) as context:
            _resolve_image_path(object(), path, "Mask_override_image")

        message = str(context.exception)
        self.assertIn(
            "Mask_override_image must be a ComfyUI input filename, not an absolute local path.",
            message,
        )
        self.assertIn("Put the mask image in ComfyUI/input", message)
        self.assertIn(f"Received: {path}", message)


if __name__ == "__main__":
    unittest.main()

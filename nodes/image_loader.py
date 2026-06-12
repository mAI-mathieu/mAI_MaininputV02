from ..utils.image_loader import (
    list_input_images,
    load_image_and_editor_mask,
    load_mask_override,
)


class mAI_ImageLoader:
    CATEGORY = "mAI/Input"
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("IMAGE", "MASK")
    FUNCTION = "load_image"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": (["none"] + list_input_images(), {"default": "none", "image_upload": True}),
                "Mask_override_image": (["none"] + list_input_images(), {"default": "none", "image_upload": True}),
            },
        }

    @classmethod
    def IS_CHANGED(cls, image="none", Mask_override_image="none", **kwargs):
        import hashlib
        import folder_paths

        m = hashlib.sha256()

        if image and image != "none":
            try:
                if folder_paths.exists_annotated_filepath(image):
                    image_path = folder_paths.get_annotated_filepath(image)
                    with open(image_path, 'rb') as f:
                        m.update(f.read())
            except Exception:
                m.update(str(image).encode("utf-8"))

        if Mask_override_image and Mask_override_image != "none":
            try:
                if folder_paths.exists_annotated_filepath(Mask_override_image):
                    mask_path = folder_paths.get_annotated_filepath(Mask_override_image)
                    with open(mask_path, 'rb') as f:
                        m.update(f.read())
            except Exception:
                m.update(str(Mask_override_image).encode("utf-8"))

        return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(cls, image="none", Mask_override_image="none", **kwargs):
        import folder_paths

        def is_absolute_path(filename):
            if not filename:
                return False
            import posixpath
            import ntpath
            return (
                posixpath.isabs(filename)
                or ntpath.isabs(filename)
                or filename.startswith("/")
                or filename.startswith("\\")
            )

        if image and image != "none":
            if is_absolute_path(image):
                return f"Absolute paths are not allowed for image: {image}"

            if not folder_paths.exists_annotated_filepath(image):
                return f"Invalid image file: {image}"

        if Mask_override_image and Mask_override_image != "none":
            if is_absolute_path(Mask_override_image):
                return f"Absolute paths are not allowed for Mask_override_image: {Mask_override_image}"
            if not folder_paths.exists_annotated_filepath(Mask_override_image):
                return f"Invalid mask override image file: {Mask_override_image}"

        return True

    def load_image(self, image="none", Mask_override_image="none"):
        if image and image != "none":
            main_image_tensor, editor_mask_tensor, main_image_width, main_image_height = load_image_and_editor_mask(image)
        else:
            import torch
            main_image_tensor = torch.zeros((1, 512, 512, 3), dtype=torch.float32)
            editor_mask_tensor = torch.zeros((1, 512, 512), dtype=torch.float32)
            main_image_width, main_image_height = 512, 512

        if Mask_override_image and Mask_override_image != "none":
            override_mask_tensor = load_mask_override(
                Mask_override_image,
                target_width=main_image_width,
                target_height=main_image_height,
            )
            main_mask_tensor = override_mask_tensor
        else:
            main_mask_tensor = editor_mask_tensor

        return (main_image_tensor, main_mask_tensor)

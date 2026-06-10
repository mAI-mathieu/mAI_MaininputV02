from ..utils.field_config import (
    DEFAULT_FIELDS_CONFIG_JSON,
    DEFAULT_HEIGHT,
    DEFAULT_SIZE_PRESET,
    DEFAULT_WIDTH,
    MAX_FIELDS,
    SIZE_PRESET_NAMES,
    parse_fields_config,
    resolve_size,
)
from ..utils.image_loader import (
    list_input_images,
    load_image_and_editor_mask,
    load_mask_override,
)


class mAI_MainInputV02:
    CATEGORY = "mAI/Input"
    RETURN_TYPES = (
        "INT",
        "INT",
        "STRING",
        "IMAGE",
        "MASK",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
    )
    RETURN_NAMES = (
        "width",
        "height",
        "User_prompt",
        "Main_image",
        "Main_mask",
        "out_1",
        "out_2",
        "out_3",
        "out_4",
        "out_5",
        "out_6",
        "out_7",
        "out_8",
        "out_9",
        "out_10",
        "out_11",
        "out_12",
        "out_13",
        "out_14",
        "out_15",
        "out_16",
        "out_17",
        "out_18",
        "out_19",
        "out_20",
        "out_21",
        "out_22",
        "out_23",
        "out_24",
    )
    FUNCTION = "execute"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "size_preset": (SIZE_PRESET_NAMES, {"default": DEFAULT_SIZE_PRESET}),
                "width": ("INT", {"default": DEFAULT_WIDTH, "min": 1}),
                "height": ("INT", {"default": DEFAULT_HEIGHT, "min": 1}),
                "User_prompt": ("STRING", {"default": "", "multiline": True}),
                "image": (list_input_images(), {"image_upload": True}),
                "Mask_override_image": (["none"] + list_input_images(), {"default": "none", "image_upload": True}),
                "fields_config": (
                    "STRING",
                    {"default": DEFAULT_FIELDS_CONFIG_JSON, "multiline": True},
                ),
            },
        }

    @classmethod
    def IS_CHANGED(cls, image, Mask_override_image="none", size_preset=DEFAULT_SIZE_PRESET, width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT, User_prompt="", fields_config=None, **kwargs):
        import hashlib
        import folder_paths

        m = hashlib.sha256()
        
        # Include state of static widgets and dynamic fields
        m.update(str(size_preset).encode("utf-8"))
        m.update(str(width).encode("utf-8"))
        m.update(str(height).encode("utf-8"))
        m.update(str(User_prompt).encode("utf-8"))
        m.update(str(fields_config).encode("utf-8"))

        # Main image file hashing
        try:
            if folder_paths.exists_annotated_filepath(image):
                image_path = folder_paths.get_annotated_filepath(image)
                with open(image_path, 'rb') as f:
                    m.update(f.read())
        except Exception:
            # Fallback to hashing the filename itself if reading fails
            m.update(str(image).encode("utf-8"))

        # Mask override image file hashing
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
    def VALIDATE_INPUTS(cls, image, Mask_override_image="none", **kwargs):
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

    def execute(
        self,
        size_preset=DEFAULT_SIZE_PRESET,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        User_prompt="",
        image="",
        Mask_override_image="none",
        fields_config=None,
    ):
        width, height = resolve_size(size_preset, width, height)
        main_image_tensor, editor_mask_tensor, main_image_width, main_image_height = load_image_and_editor_mask(image)

        if Mask_override_image and Mask_override_image != "none":
            override_mask_tensor = load_mask_override(
                Mask_override_image,
                target_width=main_image_width,
                target_height=main_image_height,
            )
            main_mask_tensor = override_mask_tensor
        else:
            main_mask_tensor = editor_mask_tensor

        fields = parse_fields_config(fields_config)
        values = [int(width), int(height), User_prompt, main_image_tensor, main_mask_tensor]
        values.extend(self._value_for_field(field) for field in fields)
        values.extend([""] * (MAX_FIELDS + 5 - len(values)))
        return tuple(values)

    @staticmethod
    def _value_for_field(field):
        field_type = field["type"]

        if field_type == "STRING":
            return field["value"]
        if field_type == "DROPDOWN":
            return field["value"]
        if field_type == "INT":
            return field["value"]
        if field_type == "FLOAT":
            return field["value"]
        if field_type == "BOOLEAN":
            return field["value"]

        raise ValueError(f"Unsupported field type: {field_type}")

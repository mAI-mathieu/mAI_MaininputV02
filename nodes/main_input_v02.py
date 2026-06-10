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
    load_image_and_mask_tensors,
    load_image_tensor,
    load_mask_override_tensor,
    load_mask_tensor,
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
                "Main_image": (list_input_images(), {"image_upload": True}),
                "API_mask_override_path": ("STRING", {"default": ""}),
                "fields_config": (
                    "STRING",
                    {"default": DEFAULT_FIELDS_CONFIG_JSON, "multiline": True},
                ),
            },
        }

    def execute(
        self,
        size_preset=DEFAULT_SIZE_PRESET,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        User_prompt="",
        Main_image="",
        API_mask_override_path="",
        fields_config=None,
    ):
        width, height = resolve_size(size_preset, width, height)
        main_image, editor_mask = load_image_and_mask_tensors(Main_image, "Main_image")
        main_mask = self._main_mask_value(API_mask_override_path, main_image, editor_mask)
        fields = parse_fields_config(fields_config)
        values = [int(width), int(height), User_prompt, main_image, main_mask]
        values.extend(self._value_for_field(field) for field in fields)
        values.extend([""] * (MAX_FIELDS + 5 - len(values)))
        return tuple(values)

    @staticmethod
    def _main_mask_value(API_mask_override_path, main_image, editor_mask):
        if not API_mask_override_path:
            return editor_mask

        target_size = (int(main_image.shape[2]), int(main_image.shape[1]))
        return load_mask_override_tensor(
            API_mask_override_path,
            "API_mask_override_path",
            target_size,
        )

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
        if field_type == "IMAGE":
            return load_image_tensor(field["value"], field["name"])
        if field_type == "MASK":
            return load_mask_tensor(field["value"], field["name"])

        raise ValueError(f"Unsupported field type: {field_type}")

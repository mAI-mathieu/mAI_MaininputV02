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


class mAI_MainInputV02:
    CATEGORY = "mAI/Input"
    RETURN_TYPES = (
        "INT",
        "INT",
        "STRING",
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
        fields_config=None,
    ):
        width, height = resolve_size(size_preset, width, height)
        fields = parse_fields_config(fields_config)
        values = [int(width), int(height), User_prompt]
        values.extend(self._value_for_field(field) for field in fields)
        values.extend([""] * (MAX_FIELDS + 3 - len(values)))
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
        if field_type == "IMAGE":
            raise NotImplementedError(
                "IMAGE fields are not implemented in mAI MainInputV02 v1. "
                "The UI can save image field definitions, but execution cannot "
                "emit IMAGE tensors yet."
            )

        raise ValueError(f"Unsupported field type: {field_type}")

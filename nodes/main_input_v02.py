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


def get_aspect_ratio_string(width, height):
    import math
    w, h = int(width), int(height)
    if w == 0 or h == 0:
        return "0:0"
    
    ratio = w / h
    standard_ratios = {
        "1:1": 1.0,
        "4:3": 4.0/3.0,
        "3:2": 3.0/2.0,
        "16:9": 16.0/9.0,
        "21:9": 21.0/9.0,
        "3:4": 3.0/4.0,
        "5:8": 5.0/8.0,
        "9:16": 9.0/16.0,
        "9:21": 9.0/21.0
    }
    
    best_match = None
    min_diff = 0.1  # Tolerance to catch SDXL approximations (e.g. 1344x768 is 1.75, matches 16:9's 1.77)
    
    for name, val in standard_ratios.items():
        diff = abs(ratio - val)
        if diff < min_diff:
            min_diff = diff
            best_match = name
            
    if best_match:
        return best_match
        
    # Fallback for completely custom wild sizes (e.g., 500x150)
    divisor = math.gcd(w, h)
    return f"{w//divisor}:{h//divisor}"


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
        "Aspect_ratio",

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

    @classmethod
    def IS_CHANGED(cls, size_preset=DEFAULT_SIZE_PRESET, width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT, User_prompt="", fields_config=None, **kwargs):
        import hashlib

        m = hashlib.sha256()

        # Include state of static widgets and dynamic fields
        m.update(str(size_preset).encode("utf-8"))
        m.update(str(width).encode("utf-8"))
        m.update(str(height).encode("utf-8"))
        m.update(str(User_prompt).encode("utf-8"))
        m.update(str(fields_config).encode("utf-8"))

        return m.digest().hex()


    def execute(
        self,
        size_preset=DEFAULT_SIZE_PRESET,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        User_prompt="",
        fields_config=None,
    ):
        width, height = resolve_size(size_preset, width, height)
        
        aspect_ratio_str = get_aspect_ratio_string(width, height)

        fields = parse_fields_config(fields_config)
        values = [int(width), int(height), User_prompt, aspect_ratio_str]
        values.extend(self._value_for_field(field) for field in fields)
        values.extend([""] * (MAX_FIELDS + 4 - len(values)))
        return tuple(values)

    @staticmethod
    def _value_for_field(field):
        field_type = field["type"]

        if field_type == "STRING":
            return field["value"]
        if field_type == "INT":
            return field["value"]
        if field_type == "FLOAT":
            return field["value"]
        if field_type == "BOOLEAN":
            return field["value"]

        raise ValueError(f"Unsupported field type: {field_type}")

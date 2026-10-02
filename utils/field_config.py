import json
import math


MAX_FIELDS = 24
DEFAULT_SIZE_PRESET = "custom"
DEFAULT_WIDTH = 1024
DEFAULT_HEIGHT = 1024
DEFAULT_SIZE_MULTIPLIER = 1.0
DEFAULT_DIVISIBLE_BY = 0

SIZE_PRESETS = {
    "custom": None,
    "1:1 square 1024x1024": {"width": 1024, "height": 1024},
    "3:4 portrait 896x1152": {"width": 896, "height": 1152},
    "5:8 portrait 832x1216": {"width": 832, "height": 1216},
    "9:16 portrait 768x1344": {"width": 768, "height": 1344},
    "9:21 portrait 640x1536": {"width": 640, "height": 1536},
    "4:3 landscape 1152x896": {"width": 1152, "height": 896},
    "3:2 landscape 1216x832": {"width": 1216, "height": 832},
    "16:9 landscape 1344x768": {"width": 1344, "height": 768},
    "21:9 landscape 1536x640": {"width": 1536, "height": 640},
}

SIZE_PRESET_NAMES = list(SIZE_PRESETS.keys())

SUPPORTED_FIELD_TYPES = ("STRING", "DROPDOWN", "INT", "FLOAT", "BOOLEAN")

OUTPUT_TYPE_BY_FIELD_TYPE = {
    "STRING": "STRING",
    "DROPDOWN": "STRING",
    "INT": "INT",
    "FLOAT": "FLOAT",
    "BOOLEAN": "BOOLEAN",
}

DEFAULT_FIELDS_CONFIG = []
DEFAULT_FIELDS_CONFIG_JSON = json.dumps(DEFAULT_FIELDS_CONFIG, indent=2)


def parse_fields_config(config_text):
    """Parse and validate the hidden fields_config widget JSON."""
    try:
        raw_config = json.loads(config_text or "[]")
    except json.JSONDecodeError as exc:
        raise ValueError(f"fields_config must be valid JSON: {exc.msg}") from exc

    return validate_fields_config(raw_config)


def validate_fields_config(raw_config):
    if not isinstance(raw_config, list):
        raise ValueError("fields_config must be a JSON list")

    if len(raw_config) > MAX_FIELDS:
        raise ValueError(f"fields_config supports at most {MAX_FIELDS} fields")

    return [_validate_field(item, index) for index, item in enumerate(raw_config)]


def output_type_for_field(field_type):
    return OUTPUT_TYPE_BY_FIELD_TYPE[field_type]


def resolve_size(size_preset, width, height):
    preset = SIZE_PRESETS.get(size_preset)
    if preset:
        return preset["width"], preset["height"]

    return int(width), int(height)


def parse_size_multiplier(size_multiplier):
    """Return a positive finite float, accepting legacy x1 through x4 values."""
    if isinstance(size_multiplier, str):
        size_multiplier = size_multiplier.strip().lower()
        if size_multiplier in ("x1", "x2", "x3", "x4"):
            size_multiplier = size_multiplier[1:]
    try:
        multiplier = float(size_multiplier)
    except (TypeError, ValueError, OverflowError):
        return DEFAULT_SIZE_MULTIPLIER
    return multiplier if math.isfinite(multiplier) and multiplier > 0 else DEFAULT_SIZE_MULTIPLIER


def round_to_nearest_multiple(value, divisor):
    """Round to the closest positive multiple, choosing the higher value on ties."""
    value = max(1, float(value))

    try:
        divisor = int(divisor or 0)
    except (TypeError, ValueError):
        return int(value + 0.5)

    if divisor < 2:
        return int(value + 0.5)

    lower = int(value // divisor) * divisor
    upper = lower + divisor

    if lower < divisor:
        return divisor

    if value - lower < upper - value:
        return lower

    return upper


def resolve_final_size(
    size_preset,
    width,
    height,
    size_multiplier=DEFAULT_SIZE_MULTIPLIER,
    divisible_by=DEFAULT_DIVISIBLE_BY,
):
    base_width, base_height = resolve_size(size_preset, width, height)
    multiplier = parse_size_multiplier(size_multiplier)

    multiplied_width = max(1, int(base_width)) * multiplier
    multiplied_height = max(1, int(base_height)) * multiplier

    return (
        round_to_nearest_multiple(multiplied_width, divisible_by),
        round_to_nearest_multiple(multiplied_height, divisible_by),
    )


def _validate_field(item, index):
    label = f"fields_config[{index}]"

    if not isinstance(item, dict):
        raise ValueError(f"{label} must be an object")

    field_id = item.get("id")
    if not isinstance(field_id, str) or not field_id.strip():
        raise ValueError(f"{label}.id must be a non-empty string")

    name = item.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"{label}.name must be a non-empty string")

    field_type = item.get("type")
    if not isinstance(field_type, str):
        raise ValueError(f"{label}.type must be a string")

    normalized_type = field_type.strip().upper()
    if normalized_type in ("IMAGE", "MASK"):
        raise ValueError(
            "dynamic IMAGE/MASK fields were removed and should be replaced by fixed Main_image/Main_mask"
        )

    if normalized_type not in SUPPORTED_FIELD_TYPES:
        supported = ", ".join(SUPPORTED_FIELD_TYPES)
        raise ValueError(f"{label}.type must be one of: {supported}")

    field = {
        "id": field_id.strip(),
        "name": name.strip(),
        "type": normalized_type,
    }

    if normalized_type == "DROPDOWN":
        field["options"] = _validate_dropdown_options(item.get("options", []), label)
        value = item.get("value", field["options"][0] if field["options"] else "")
        field["value"] = _string_value(value)
        return field

    field["value"] = _validate_value(item.get("value"), normalized_type, label)
    return field


def _validate_dropdown_options(options, label):
    if isinstance(options, str):
        options = [part.strip() for part in options.split(",")]

    if not isinstance(options, list):
        raise ValueError(f"{label}.options must be a list of strings")

    normalized = []
    for option in options:
        if not isinstance(option, str):
            raise ValueError(f"{label}.options must be a list of strings")
        stripped = option.strip()
        if stripped:
            normalized.append(stripped)

    return normalized


def _validate_value(value, field_type, label):
    if field_type == "STRING":
        return _string_value(value)
    if field_type == "INT":
        return int(value if value is not None else 0)
    if field_type == "FLOAT":
        return float(value if value is not None else 0.0)
    if field_type == "BOOLEAN":
        return _bool_value(value)

    raise ValueError(f"{label}.type is not supported: {field_type}")


def _string_value(value):
    if value is None:
        return ""
    return str(value)


def _bool_value(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)

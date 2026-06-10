import json


MAX_FIELDS = 24

SUPPORTED_FIELD_TYPES = ("STRING", "DROPDOWN", "IMAGE", "INT", "FLOAT", "BOOLEAN")

OUTPUT_TYPE_BY_FIELD_TYPE = {
    "STRING": "STRING",
    "DROPDOWN": "STRING",
    "IMAGE": "IMAGE",
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
    if field_type in ("STRING", "IMAGE"):
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

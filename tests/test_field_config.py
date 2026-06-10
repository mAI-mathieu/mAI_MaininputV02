import json
import unittest

from utils.field_config import DEFAULT_FIELDS_CONFIG, MAX_FIELDS, parse_fields_config, resolve_size


class FieldConfigTests(unittest.TestCase):
    def test_default_fields_config_is_valid(self):
        self.assertEqual(
            parse_fields_config(json.dumps(DEFAULT_FIELDS_CONFIG)),
            DEFAULT_FIELDS_CONFIG,
        )

    def test_parse_fields_config_normalizes_values(self):
        result = parse_fields_config(
            """
            [
              {
                "id": " field_1 ",
                "name": " positive_prompt ",
                "type": "string",
                "value": "a cinematic photo"
              },
              {
                "id": "field_2",
                "name": "ratio",
                "type": "DROPDOWN",
                "options": "1:1, 16:9, 9:16",
                "value": "16:9"
              }
            ]
            """
        )

        self.assertEqual(
            result,
            [
                {
                    "id": "field_1",
                    "name": "positive_prompt",
                    "type": "STRING",
                    "value": "a cinematic photo",
                },
                {
                    "id": "field_2",
                    "name": "ratio",
                    "type": "DROPDOWN",
                    "options": ["1:1", "16:9", "9:16"],
                    "value": "16:9",
                },
            ],
        )

    def test_parse_fields_config_requires_list(self):
        with self.assertRaisesRegex(ValueError, "must be a JSON list"):
            parse_fields_config('{"id": "field_1"}')

    def test_parse_fields_config_rejects_too_many_fields(self):
        config = [
            {
                "id": f"field_{index}",
                "name": f"string_{index}",
                "type": "STRING",
                "value": "",
            }
            for index in range(MAX_FIELDS + 1)
        ]

        with self.assertRaisesRegex(ValueError, "at most 24 fields"):
            parse_fields_config(json.dumps(config))

    def test_parse_fields_config_rejects_invalid_type(self):
        with self.assertRaisesRegex(ValueError, "type must be one of"):
            parse_fields_config(
                '[{"id": "field_1", "name": "latent", "type": "LATENT", "value": ""}]'
            )

    def test_parse_fields_config_rejects_invalid_dropdown_options(self):
        with self.assertRaisesRegex(ValueError, "options must be a list of strings"):
            parse_fields_config(
                '[{"id": "field_1", "name": "ratio", "type": "DROPDOWN", '
                '"options": [1], "value": "1"}]'
            )

    def test_resolve_size_uses_preset_dimensions(self):
        self.assertEqual(resolve_size("3:4 portrait 896x1152", 1, 1), (896, 1152))

    def test_resolve_size_custom_uses_supplied_dimensions(self):
        self.assertEqual(resolve_size("custom", 640, 480), (640, 480))


if __name__ == "__main__":
    unittest.main()

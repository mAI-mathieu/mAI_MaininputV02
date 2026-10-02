import json
import unittest

from utils.field_config import (
    DEFAULT_FIELDS_CONFIG,
    MAX_FIELDS,
    parse_fields_config,
    parse_size_multiplier,
    resolve_final_size,
    resolve_size,
    round_to_nearest_multiple,
)


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

    def test_parse_fields_config_rejects_legacy_image_mask_fields(self):
        legacy_configs = [
            '[{"id": "field_1", "name": "ref_img", "type": "IMAGE", "value": "img.png"}]',
            '[{"id": "field_1", "name": "ref_mask", "type": "MASK", "value": "mask.png"}]',
        ]
        for config in legacy_configs:
            with self.assertRaisesRegex(
                ValueError,
                "dynamic IMAGE/MASK fields were removed and should be replaced by fixed Main_image/Main_mask"
            ):
                parse_fields_config(config)

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

    def test_parse_size_multiplier_preserves_legacy_options(self):
        self.assertEqual(parse_size_multiplier("x1"), 1)
        self.assertEqual(parse_size_multiplier("x2"), 2)
        self.assertEqual(parse_size_multiplier("x3"), 3)
        self.assertEqual(parse_size_multiplier("x4"), 4)
        self.assertEqual(parse_size_multiplier("invalid"), 1)

    def test_parse_size_multiplier_accepts_floats(self):
        for value in (0.5, 1.0, 1.25, 2.0, 5.5, "1.5"):
            with self.subTest(value=value):
                self.assertEqual(parse_size_multiplier(value), float(value))
                self.assertIsInstance(parse_size_multiplier(value), float)

    def test_parse_size_multiplier_invalid_values_default_to_one(self):
        for value in (None, "", "invalid", 0, -1, float("nan"), float("inf")):
            with self.subTest(value=value):
                self.assertEqual(parse_size_multiplier(value), 1.0)

    def test_resolve_final_size_scales_up_and_down(self):
        for multiplier, expected in ((1.5, (960, 720)), (0.5, (320, 240))):
            with self.subTest(multiplier=multiplier):
                self.assertEqual(resolve_final_size("custom", 640, 480, multiplier), expected)

    def test_fractional_pixels_round_to_nearest_integer(self):
        self.assertEqual(resolve_final_size("custom", 101, 103, 0.5), (51, 52))
        self.assertEqual(resolve_final_size("custom", 1, 1, 0.01), (1, 1))

    def test_fractional_multiplier_rounds_directly_to_nearest_multiple(self):
        self.assertEqual(resolve_final_size("custom", 129, 101, 0.75, 64), (128, 64))

    def test_round_to_nearest_multiple_disabled_values_do_nothing(self):
        self.assertEqual(round_to_nearest_multiple(1510, 0), 1510)
        self.assertEqual(round_to_nearest_multiple(1510, 1), 1510)

    def test_round_to_nearest_multiple_uses_higher_value_for_ties(self):
        self.assertEqual(round_to_nearest_multiple(96, 64), 128)

    def test_round_to_nearest_multiple_never_returns_below_divisor(self):
        self.assertEqual(round_to_nearest_multiple(1, 64), 64)
        self.assertEqual(round_to_nearest_multiple(31, 64), 64)

    def test_resolve_final_size_rounds_after_multiplying(self):
        self.assertEqual(
            resolve_final_size("custom", 1000, 755, 2.0, 64),
            (1984, 1536),
        )

    def test_resolve_final_size_uses_preset_before_multiplying(self):
        self.assertEqual(
            resolve_final_size("3:4 portrait 896x1152", 1, 1, 1.5, 0),
            (1344, 1728),
        )


if __name__ == "__main__":
    unittest.main()

import importlib.util
import json
import pathlib
import sys
import unittest
from unittest import mock


# The package also registers mAI_ImageLoader, whose imports expect ComfyUI's
# folder_paths module even though these tests exercise only mAI_MainInputV02.
sys.modules["folder_paths"] = mock.MagicMock()


def load_node_package():
    root = pathlib.Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location(
        "mAI_MainInputV02_testpkg",
        root / "__init__.py",
        submodule_search_locations=[str(root)],
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MainInputV02Tests(unittest.TestCase):
    def node_class(self):
        module = load_node_package()
        return module.NODE_CLASS_MAPPINGS["mAI_MainInputV02"]

    def test_input_types_include_compatible_size_defaults(self):
        node_class = self.node_class()

        input_types = node_class.INPUT_TYPES()
        required = input_types["required"]
        optional = input_types["optional"]

        self.assertEqual(
            list(required),
            [
                "size_preset",
                "width",
                "height",
                "User_prompt",
                "fields_config",
            ],
        )
        self.assertEqual(list(optional), ["size_multiplier", "divisible_by"])
        self.assertEqual(optional["size_multiplier"][0], ["x1", "x2", "x3", "x4"])
        self.assertEqual(optional["size_multiplier"][1]["default"], "x1")
        self.assertEqual(optional["divisible_by"][1], {"default": 0, "min": 0})

    def test_output_count_and_fixed_outputs_remain_stable(self):
        node_class = self.node_class()

        self.assertEqual(len(node_class.RETURN_TYPES), 28)
        self.assertEqual(len(node_class.RETURN_NAMES), 28)
        self.assertEqual(
            node_class.RETURN_NAMES[:4],
            ("Width", "Height", "User_prompt", "Aspect_ratio"),
        )

        fields = [
            {
                "id": f"field_{index}",
                "name": f"value_{index}",
                "type": "INT",
                "value": index,
            }
            for index in range(24)
        ]
        result = node_class().execute(fields_config=json.dumps(fields))

        self.assertEqual(len(result), 28)
        self.assertEqual(result[:4], (1024, 1024, "", "1:1"))
        self.assertEqual(result[4:], tuple(range(24)))

    def test_execute_returns_configured_values_and_safe_padding(self):
        node = self.node_class()()
        fields_config = """
        [
          {
            "id": "field_1",
            "name": "positive_prompt",
            "type": "STRING",
            "value": "sunlit mountains"
          },
          {
            "id": "field_2",
            "name": "batch_size",
            "type": "INT",
            "value": 4
          },
          {
            "id": "field_3",
            "name": "strength",
            "type": "FLOAT",
            "value": 0.75
          },
          {
            "id": "field_4",
            "name": "enabled",
            "type": "BOOLEAN",
            "value": true
          }
        ]
        """

        result = node.execute(
            size_preset="custom",
            width=1024,
            height=768,
            User_prompt="keep this prompt fixed",
            fields_config=fields_config,
        )

        self.assertEqual(len(result), 28)
        self.assertEqual(
            result[:8],
            (
                1024,
                768,
                "keep this prompt fixed",
                "4:3",
                "sunlit mountains",
                4,
                0.75,
                True,
            ),
        )
        self.assertEqual(result[8:], ("",) * 20)

    def test_x1_keeps_custom_size_unchanged(self):
        result = self.node_class()().execute(
            width=1000,
            height=755,
            size_multiplier="x1",
            divisible_by=0,
            fields_config="[]",
        )

        self.assertEqual(result[:2], (1000, 755))

    def test_x2_x3_and_x4_multiply_custom_size(self):
        node = self.node_class()()

        for multiplier, expected in (
            ("x2", (1280, 960)),
            ("x3", (1920, 1440)),
            ("x4", (2560, 1920)),
        ):
            with self.subTest(multiplier=multiplier):
                result = node.execute(
                    width=640,
                    height=480,
                    size_multiplier=multiplier,
                    fields_config="[]",
                )
                self.assertEqual(result[:2], expected)

    def test_multiplier_applies_to_preset_size(self):
        result = self.node_class()().execute(
            size_preset="16:9 landscape 1344x768",
            width=1,
            height=1,
            size_multiplier="x2",
            fields_config="[]",
        )

        self.assertEqual(result[:2], (2688, 1536))

    def test_divisible_rounding_applies_after_multiplier(self):
        result = self.node_class()().execute(
            width=1000,
            height=755,
            size_multiplier="x2",
            divisible_by=64,
            fields_config="[]",
        )

        self.assertEqual(result[:2], (1984, 1536))

    def test_is_changed_includes_new_size_controls(self):
        node_class = self.node_class()

        baseline = node_class.IS_CHANGED(size_multiplier="x1", divisible_by=0)
        multiplied = node_class.IS_CHANGED(size_multiplier="x2", divisible_by=0)
        rounded = node_class.IS_CHANGED(size_multiplier="x1", divisible_by=64)

        self.assertNotEqual(baseline, multiplied)
        self.assertNotEqual(baseline, rounded)


if __name__ == "__main__":
    unittest.main()

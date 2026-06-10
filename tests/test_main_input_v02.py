import importlib.util
import pathlib
import sys
import unittest


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
    def test_input_types_are_widgets_only(self):
        module = load_node_package()
        node_class = module.NODE_CLASS_MAPPINGS["mAI_MainInputV02"]

        input_types = node_class.INPUT_TYPES()

        self.assertNotIn("optional", input_types)
        self.assertEqual(set(input_types["required"]), {"fields_config"})
        self.assertEqual(len(node_class.RETURN_TYPES), 24)
        self.assertEqual(len(node_class.RETURN_NAMES), 24)

    def test_execute_returns_configured_values_and_safe_padding(self):
        module = load_node_package()
        node = module.NODE_CLASS_MAPPINGS["mAI_MainInputV02"]()

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
            "name": "ratio",
            "type": "DROPDOWN",
            "options": ["square", "portrait", "landscape"],
            "value": "portrait"
          },
          {
            "id": "field_3",
            "name": "batch_size",
            "type": "INT",
            "value": 4
          },
          {
            "id": "field_4",
            "name": "strength",
            "type": "FLOAT",
            "value": 0.75
          },
          {
            "id": "field_5",
            "name": "enabled",
            "type": "BOOLEAN",
            "value": true
          }
        ]
        """
        result = node.execute(fields_config)

        self.assertEqual(len(result), 24)
        self.assertEqual(result[:5], ("sunlit mountains", "portrait", 4, 0.75, True))
        self.assertEqual(result[5:], ("",) * 19)

    def test_execute_image_field_is_clear_not_implemented_error(self):
        module = load_node_package()
        node = module.NODE_CLASS_MAPPINGS["mAI_MainInputV02"]()

        fields_config = """
        [
          {
            "id": "field_1",
            "name": "reference_image",
            "type": "IMAGE",
            "value": "example.png"
          }
        ]
        """

        with self.assertRaisesRegex(NotImplementedError, "IMAGE fields are not implemented"):
            node.execute(fields_config)


if __name__ == "__main__":
    unittest.main()

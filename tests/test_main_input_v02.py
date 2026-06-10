import importlib.util
import pathlib
import sys
import unittest
from unittest import mock


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
    def node_class_and_module(self):
        module = load_node_package()
        node_class = module.NODE_CLASS_MAPPINGS["mAI_MainInputV02"]
        node_module = sys.modules[node_class.__module__]
        return node_class, node_module

    def test_input_types_are_widgets_only(self):
        node_class, _node_module = self.node_class_and_module()

        input_types = node_class.INPUT_TYPES()

        self.assertNotIn("optional", input_types)
        self.assertEqual(
            set(input_types["required"]),
            {
                "size_preset",
                "width",
                "height",
                "User_prompt",
                "Main_image",
                "API_mask_override_path",
                "fields_config",
            },
        )
        self.assertEqual(len(node_class.RETURN_TYPES), 29)
        self.assertEqual(len(node_class.RETURN_NAMES), 29)
        self.assertEqual(node_class.RETURN_TYPES[:5], ("INT", "INT", "STRING", "IMAGE", "MASK"))
        self.assertEqual(
            node_class.RETURN_NAMES[:5],
            ("width", "height", "User_prompt", "Main_image", "Main_mask"),
        )

    def test_execute_returns_configured_values_and_safe_padding(self):
        node_class, node_module = self.node_class_and_module()
        node = node_class()
        main_image = FakeImageTensor()
        editor_mask = object()

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
        with mock.patch.object(
            node_module,
            "load_image_and_mask_tensors",
            return_value=(main_image, editor_mask),
        ):
            result = node.execute(
                size_preset="custom",
                width=1232,
                height=768,
                User_prompt="keep this prompt fixed",
                Main_image="input.png",
                fields_config=fields_config,
            )

        self.assertEqual(len(result), 29)
        self.assertEqual(
            result[:10],
            (
                1232,
                768,
                "keep this prompt fixed",
                main_image,
                editor_mask,
                "sunlit mountains",
                "portrait",
                4,
                0.75,
                True,
            ),
        )
        self.assertEqual(result[10:], ("",) * 19)

    def test_execute_non_custom_preset_controls_width_and_height(self):
        node_class, node_module = self.node_class_and_module()
        node = node_class()
        main_image = FakeImageTensor()
        editor_mask = object()

        with mock.patch.object(
            node_module,
            "load_image_and_mask_tensors",
            return_value=(main_image, editor_mask),
        ):
            result = node.execute(
                size_preset="16:9 landscape 1344x768",
                width=1,
                height=1,
                User_prompt="api prompt",
                Main_image="input.png",
                fields_config="[]",
            )

        self.assertEqual(len(result), 29)
        self.assertEqual(result[:5], (1344, 768, "api prompt", main_image, editor_mask))
        self.assertEqual(result[5:], ("",) * 24)

    def test_execute_requires_main_image(self):
        node_class, _node_module = self.node_class_and_module()
        node = node_class()

        with self.assertRaisesRegex(ValueError, "Main_image.*requires an image filename"):
            node.execute(fields_config="[]")

    def test_execute_api_mask_override_path_replaces_editor_mask(self):
        node_class, node_module = self.node_class_and_module()
        node = node_class()
        main_image = FakeImageTensor()
        editor_mask = object()
        override_mask = object()

        with mock.patch.object(
            node_module,
            "load_image_and_mask_tensors",
            return_value=(main_image, editor_mask),
        ), mock.patch.object(
            node_module,
            "load_mask_override_tensor",
            return_value=override_mask,
        ) as load_override:
            result = node.execute(
                Main_image="input.png",
                API_mask_override_path="input_mask.png",
                fields_config="[]",
            )

        self.assertEqual(result[:5], (1024, 1024, "", main_image, override_mask))
        load_override.assert_called_once_with(
            "input_mask.png",
            "API_mask_override_path",
            (64, 32),
        )

    def test_execute_image_field_requires_filename(self):
        node_class, node_module = self.node_class_and_module()
        node = node_class()

        fields_config = """
        [
          {
            "id": "field_1",
            "name": "reference_image",
            "type": "IMAGE",
            "value": ""
          }
        ]
        """

        with mock.patch.object(
            node_module,
            "load_image_and_mask_tensors",
            return_value=(FakeImageTensor(), object()),
        ):
            with self.assertRaisesRegex(ValueError, "reference_image.*requires an image filename"):
                node.execute(Main_image="input.png", fields_config=fields_config)

    def test_execute_mask_field_requires_filename(self):
        node_class, node_module = self.node_class_and_module()
        node = node_class()

        fields_config = """
        [
          {
            "id": "field_1",
            "name": "subject_mask",
            "type": "MASK",
            "value": ""
          }
        ]
        """

        with mock.patch.object(
            node_module,
            "load_image_and_mask_tensors",
            return_value=(FakeImageTensor(), object()),
        ):
            with self.assertRaisesRegex(ValueError, "subject_mask.*requires an image filename"):
                node.execute(Main_image="input.png", fields_config=fields_config)


class FakeImageTensor:
    shape = (1, 32, 64, 3)


if __name__ == "__main__":
    unittest.main()

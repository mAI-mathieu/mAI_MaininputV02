# mAI MainInputV02

Standalone ComfyUI custom node pack for building a visual main input node with
dynamic outputs.

Users add output fields with buttons inside the node. The raw JSON config is
kept in a hidden `fields_config` widget so workflows can save, reload, and
export to API format without requiring manual JSON editing.

The node also includes fixed size controls and outputs:

- `size_preset`
- `width`
- `height`
- `User_prompt`
- `Main_image`
- `API_mask_override_path`

## Node

- Display name: `mAI MainInputV02`
- Internal name: `mAI_MainInputV02`
- Category: `mAI/Input`

## Installation

Copy this folder into your ComfyUI `custom_nodes` folder and restart ComfyUI.
The node should appear under `mAI/Input`.

No install script or heavy dependencies are required.

## How It Works

The node has no connectable input sockets on the left side. It always exposes
fixed `width`, `height`, `User_prompt`, `Main_image`, and `Main_mask` outputs
first, then dynamic output sockets on the right side.

Use `size_preset` to set common dimensions. Selecting a non-custom preset
updates `width` and `height`. Editing `width` or `height` manually switches the
preset back to `custom`.

`User_prompt` is a mandatory multiline text widget. It always outputs `STRING`
and is not part of the dynamic `fields_config`.

`Main_image` is a fixed image upload/select widget. It stores a ComfyUI input
filename and outputs a real `IMAGE` tensor, similar to the regular ComfyUI Load
Image node.

`API_mask_override_path` is a visible single-line text widget for API use. It is
not an output, not a dynamic field, and not stored in `fields_config`.

Available presets:

- `custom`
- `1:1 square 1024x1024`
- `3:4 portrait 896x1152`
- `5:8 portrait 832x1216`
- `9:16 portrait 768x1344`
- `9:21 portrait 640x1536`
- `4:3 landscape 1152x896`
- `3:2 landscape 1216x832`
- `16:9 landscape 1344x768`
- `21:9 landscape 1536x640`

Use the node buttons to add dynamic scalar fields:

- `+ String`
- `+ Dropdown`
- `+ Int`
- `+ Float`
- `+ Boolean`

Each added field creates visible controls for the value, a matching output
socket, and an internal serialized field definition in `fields_config`.

Dynamic outputs always appear after the fixed `width`, `height`, `User_prompt`,
`Main_image`, and `Main_mask` outputs.

## Supported Dynamic Field Types

- `STRING`: outputs `STRING`
- `DROPDOWN`: outputs `STRING`
- `INT`: outputs `INT`
- `FLOAT`: outputs `FLOAT`
- `BOOLEAN`: outputs `BOOLEAN`

> [!NOTE]
> Dynamic `IMAGE` and `MASK` fields are not supported. Use the fixed `Main_image` and `Main_mask` outputs instead. If an old workflow or API payload attempts to load a dynamic `IMAGE` or `MASK` in `fields_config`, the backend raises a descriptive ValueError instructing you to migrate to the fixed `Main_image`/`Main_mask` outputs.

## Main Image And Mask

The fixed `Main_image` widget stores a ComfyUI input filename and outputs a real
ComfyUI `IMAGE` tensor. Its mask behavior mirrors ComfyUI's Load Image node:
when a mask is painted with the normal ComfyUI mask editor, that mask is saved
into the selected image's alpha channel and loaded back from there.

The fixed `Main_mask` output is produced with this priority:

1. If `API_mask_override_path` is filled, load that filename and output it as
   `Main_mask`.
2. If `API_mask_override_path` is empty, use the regular Load Image mask data
   associated with `Main_image`, including alpha data saved by ComfyUI's mask
   editor.
3. If no mask exists, output an empty mask matching the `Main_image` dimensions.

`API_mask_override_path` is for API override only. It intentionally overrides
the mask editor only when filled. It expects a ComfyUI input filename such as
`mask.png` or `masks/mask.png`, not an absolute local path or temporary Windows
path. To use the override, first copy the mask into `ComfyUI/input` or upload it
through the ComfyUI API, then use the uploaded filename.

Override mask files with alpha use the alpha channel; normal RGB or grayscale
image files are converted to luminance. If the override mask dimensions differ
from `Main_image`, the mask is resized to match `Main_image`.

## API Export Note

ComfyUI requires static class-level return definitions, so the Python backend
declares fixed `INT` outputs for `width` and `height`, fixed `STRING`,
`IMAGE`, and `MASK` outputs for `User_prompt`, `Main_image`, and `Main_mask`,
followed by 24 wildcard fallback outputs:

```text
width, height, User_prompt, Main_image, Main_mask, out_1 ... out_24
```

The frontend replaces the visible outputs with the field names and types stored
in `fields_config`, while keeping `width`, `height`, `User_prompt`,
`Main_image`, and `Main_mask` fixed at the front. API exports should include
`size_preset`, `width`, `height`, `User_prompt`, `Main_image`,
`API_mask_override_path`, and `fields_config`. If `size_preset` is `custom`,
API execution uses the supplied `width` and `height`. Non-custom presets
resolve to their mapped dimensions. API callers can set `User_prompt`,
`Main_image`, and `API_mask_override_path` directly as normal node inputs.

Fixed image/mask API example:

```json
{
  "Main_image": "input_image.png",
  "API_mask_override_path": "input_mask.png"
}
```

When `API_mask_override_path` is empty, the `Main_mask` output uses mask editor
data from `Main_image` when available, otherwise it returns an empty mask.

`API_mask_override_path` must be a ComfyUI input filename. Absolute local paths
such as `C:\temp\some_mask.png` are rejected by default for safety. Upload or
copy that file into `ComfyUI/input` first, then use the resulting filename.


Example internal config:

```json
[
  {
    "id": "field_1",
    "name": "positive_prompt",
    "type": "STRING",
    "value": "a cinematic photo"
  },
  {
    "id": "field_2",
    "name": "ratio",
    "type": "DROPDOWN",
    "options": ["1:1", "16:9", "9:16"],
    "value": "1:1"
  }
]
```

Users should not need to edit this JSON directly.

## Known Limitations

- Maximum of 24 fields.
- `width`, `height`, `User_prompt`, `Main_image`, and `Main_mask` are fixed
  outputs and cannot be removed or renamed.
- Removing a field removes its matching output socket and can remove links from
  that socket.
- Changing field names updates output socket names, but existing downstream
  nodes may still need a quick visual check after complex workflow edits.

## Troubleshooting

If fields do not restore after reload, open the browser console and look for
warnings from `mAI.MainInputV02`.

Common causes:

- `fields_config` is missing from an API/workflow export.
- `fields_config` contains invalid JSON.
- A field is missing `id`, `name`, `type`, or `value`.
- `Main_image` is empty or points to a missing file.
- `API_mask_override_path` points to a missing file, invalid file, or absolute
  local path instead of a ComfyUI input filename.
- More than 24 fields are defined.

## Test Checklist

1. Restart ComfyUI.
2. Add `mAI MainInputV02`.
3. Confirm `size_preset`, `width`, `height`, `User_prompt`, `Main_image`,
   and `API_mask_override_path` are visible.
4. Confirm no left-side input sockets.
5. Confirm the fixed outputs are `width`, `height`, `User_prompt`,
   `Main_image`, and `Main_mask`.
6. Select `1:1 square 1024x1024` and confirm width/height become `1024`.
7. Select `16:9 landscape 1344x768` and confirm width becomes `1344` and
   height becomes `768`.
8. Manually edit `width` and confirm `size_preset` becomes `custom`.
9. Type text in `User_prompt` and connect it to Display Any.
10. Select/upload `Main_image`, connect it to Preview Image, and confirm the
    image passes through.
11. Open the mask editor from `Main_image` if available, paint a mask, and keep
    `API_mask_override_path` empty.
12. Connect `Main_mask` to a mask consumer and confirm the editor mask is used.
13. Set `API_mask_override_path` to a valid mask filename.
14. Confirm `Main_mask` now uses `API_mask_override_path`.
15. Clear `API_mask_override_path` and confirm `Main_mask` returns to the
    `Main_image` mask data.
16. Test no editor mask and empty `API_mask_override_path`, and confirm an
    empty mask output works.
17. Confirm there is no visible JSON editing workflow.
18. Click `+ String`.
19. Confirm a string field appears and a `STRING` output appears after all
    fixed outputs.
20. Rename the field.
21. Confirm the output socket name updates.
22. Click `+ Dropdown`.
23. Add options: `square, portrait, landscape`.
24. Confirm the dropdown works and outputs `STRING`.
25. Click `+ Int`, `+ Float`, and `+ Boolean`.
26. Confirm each creates the correct output socket type after the fixed outputs.
27. Remove one field.
30. Confirm its output disappears and fixed outputs remain.
31. Save the workflow.
32. Reload the browser.
33. Confirm all fixed and dynamic outputs are restored.
34. Confirm `Main_image` and `API_mask_override_path` filenames persist.
35. Export workflow/API format.
36. Confirm `size_preset`, `width`, `height`, `User_prompt`, `Main_image`,
    `API_mask_override_path`, and `fields_config` are present.
37. Run the workflow and confirm scalar outputs work correctly.

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
fixed `width`, `height`, and `User_prompt` outputs first, then dynamic output
sockets on the right side.

Use `size_preset` to set common dimensions. Selecting a non-custom preset
updates `width` and `height`. Editing `width` or `height` manually switches the
preset back to `custom`.

`User_prompt` is a mandatory multiline text widget. It always outputs `STRING`
and is not part of the dynamic `fields_config`.

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

Use the node buttons to add fields:

- `+ String`
- `+ Dropdown`
- `+ Image`
- `+ Int`
- `+ Float`
- `+ Boolean`

Each added field creates visible controls for the value, a matching output
socket, and an internal serialized field definition in `fields_config`.

Dynamic outputs always appear after the fixed `width`, `height`, and
`User_prompt` outputs.

## Supported Field Types

- `STRING`: outputs `STRING`
- `DROPDOWN`: outputs `STRING`
- `IMAGE`: outputs `IMAGE` socket, execution TODO in v1
- `INT`: outputs `INT`
- `FLOAT`: outputs `FLOAT`
- `BOOLEAN`: outputs `BOOLEAN`

## IMAGE Status

`IMAGE` fields are a UI/socket stub in v1. They can be added, saved, reloaded,
and exported, but execution raises a clear `NotImplementedError`.

This is intentional: the node has no input sockets and does not yet implement
ComfyUI-compatible image tensor loading. It does not fake image output with a
string.

## API Export Note

ComfyUI requires static class-level return definitions, so the Python backend
declares fixed `INT` outputs for `width` and `height`, followed by 24 wildcard
fallback outputs. `User_prompt` is a fixed `STRING` output between the fixed
size outputs and the dynamic fallback outputs:

```text
width, height, User_prompt, out_1 ... out_24
```

The frontend replaces the visible outputs with the field names and types stored
in `fields_config`, while keeping `width`, `height`, and `User_prompt` fixed at
the front. API exports should include `size_preset`, `width`, `height`,
`User_prompt`, and `fields_config`. If `size_preset` is `custom`, API execution
uses the supplied `width` and `height`. Non-custom presets resolve to their
mapped dimensions. API callers can set `User_prompt` directly as a normal node
input.

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
- `width`, `height`, and `User_prompt` are fixed outputs and cannot be removed
  or renamed.
- `IMAGE` execution is not implemented in v1.
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
- More than 24 fields are defined.

## Test Checklist

1. Restart ComfyUI.
2. Add `mAI MainInputV02`.
3. Confirm `size_preset`, `width`, `height`, and `User_prompt` are visible.
4. Confirm no left-side input sockets.
5. Confirm `width`, `height`, and `User_prompt` are the first three outputs.
6. Select `1:1 square 1024x1024` and confirm width/height become `1024`.
7. Select `16:9 landscape 1344x768` and confirm width becomes `1344` and
   height becomes `768`.
8. Manually edit `width` and confirm `size_preset` becomes `custom`.
9. Type text in `User_prompt` and connect it to Display Any.
10. Confirm there is no visible JSON editing workflow.
11. Click `+ String`.
12. Confirm a string field appears and a `STRING` output appears after
    `width`, `height`, and `User_prompt`.
13. Rename the field.
14. Confirm the output socket name updates.
15. Click `+ Dropdown`.
16. Add options: `square, portrait, landscape`.
17. Confirm the dropdown works and outputs `STRING`.
18. Click `+ Int`, `+ Float`, and `+ Boolean`.
19. Confirm each creates the correct output socket type after the fixed outputs.
20. Remove one field.
21. Confirm its output disappears and fixed outputs remain.
22. Save the workflow.
23. Reload the browser.
24. Confirm all fixed and dynamic outputs are restored.
25. Export workflow/API format.
26. Confirm `size_preset`, `width`, `height`, `User_prompt`, and
    `fields_config` are present.
27. Run the workflow and confirm scalar values output correctly.
28. Test image field execution only after the image-loading follow-up is
    implemented.

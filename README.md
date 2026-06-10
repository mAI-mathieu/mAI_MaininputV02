# mAI MainInputV02

Standalone ComfyUI custom node pack for building a visual main input node with
dynamic outputs.

Users add output fields with buttons inside the node. The raw JSON config is
kept in a hidden `fields_config` widget so workflows can save, reload, and
export to API format without requiring manual JSON editing.

## Node

- Display name: `mAI MainInputV02`
- Internal name: `mAI_MainInputV02`
- Category: `mAI/Input`

## Installation

Copy this folder into your ComfyUI `custom_nodes` folder and restart ComfyUI.
The node should appear under `mAI/Input`.

No install script or heavy dependencies are required.

## How It Works

The node has no connectable input sockets on the left side. It only creates
dynamic output sockets on the right side.

Use the node buttons to add fields:

- `+ String`
- `+ Dropdown`
- `+ Image`
- `+ Int`
- `+ Float`
- `+ Boolean`

Each added field creates visible controls for the value, a matching output
socket, and an internal serialized field definition in `fields_config`.

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
declares 24 wildcard fallback outputs:

```text
out_1 ... out_24
```

The frontend replaces the visible outputs with the field names and types stored
in `fields_config`. API exports should include `fields_config`, which contains
the stable ids, names, types, values, and dropdown options for the fields.

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
3. Confirm no left-side input sockets.
4. Confirm there is no visible JSON editing workflow.
5. Click `+ String`.
6. Confirm a string field appears and a `STRING` output appears.
7. Rename the field.
8. Confirm the output socket name updates.
9. Click `+ Dropdown`.
10. Add options: `square, portrait, landscape`.
11. Confirm the dropdown works and outputs `STRING`.
12. Click `+ Int`, `+ Float`, and `+ Boolean`.
13. Confirm each creates the correct output socket type.
14. Remove one field.
15. Confirm its output disappears.
16. Save the workflow.
17. Reload the browser.
18. Confirm all fields and outputs are restored.
19. Export workflow/API format.
20. Confirm `fields_config` is present and contains the field definitions.
21. Run the workflow and confirm scalar values output correctly.
22. Test image field execution only after the image-loading follow-up is
    implemented.

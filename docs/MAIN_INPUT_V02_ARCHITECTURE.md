# mAI MainInputV02 Architecture

`mAI_MainInputV02` is a standalone ComfyUI main input/configuration node. It has
no connectable input sockets. Users add fields through frontend buttons, and
each field creates a visible widget plus a matching dynamic output socket.

The node also has fixed size state:

- `size_preset`: serialized dropdown widget
- `width`: serialized `INT` widget and fixed `INT` output
- `height`: serialized `INT` widget and fixed `INT` output
- `User_prompt`: serialized multiline `STRING` widget and fixed `STRING` output

Fixed outputs always appear first in this order:

1. `width`
2. `height`
3. `User_prompt`

Dynamic field outputs start after them.

## Serialized State

The hidden `fields_config` widget is the source of truth for workflow save/load
and API export. Dynamic field widgets are marked with `serialize = false`, so
they do not become independent serialized state.

`size_preset`, `width`, `height`, and `User_prompt` are ordinary serialized
widgets. API workflows can set them directly. When `size_preset` is `custom`,
the supplied `width` and `height` values are used. Non-custom presets resolve to
their mapped dimensions in the backend.

`User_prompt` is not stored in `fields_config`.

Each field stores:

- `id`: stable field identifier
- `name`: output/widget label
- `type`: `STRING`, `DROPDOWN`, `IMAGE`, `INT`, `FLOAT`, or `BOOLEAN`
- `value`: current field value
- `options`: dropdown options, only for `DROPDOWN`

Per-node runtime state is stored on the node instance with
`__mAI_MainInputV02_*` properties. There is no shared field config, localStorage,
or sessionStorage.

## Frontend Modules

- `main_input_v02.js`: ComfyUI extension registration and node lifecycle hooks.
- `constants.js`: shared extension constants, size presets, fixed output
  descriptors, and field type maps.
- `field_config.js`: field parsing, validation, normalization, and
  serialization.
- `node_state.js`: hidden config widget access, per-node field state, canvas
  dirty marking, warnings, and rebuild scheduling.
- `field_widgets.js`: fixed size widget callbacks, add/remove field controls,
  dynamic widget creation, widget relabeling, resize behavior, and
  `rebuildFromConfig`.
- `output_sync.js`: output socket creation/removal/rename and link-preserving
  reload normalization.

## Reload Behavior

On node creation and workflow configure, the frontend hides `fields_config` and
schedules a debounced rebuild. Rebuild reads `fields_config`, removes previous
dynamic field widgets, recreates the visible field widgets, and normalizes the
output sockets. Output normalization always emits fixed `width`, `height`, and
`User_prompt` descriptors first, then appends dynamic field descriptors.

The rebuild does not remove outputs with `node.removeOutput()` in a broad loop.
Instead, `normalizeOutputsAfterLoad` builds the expected output list and migrates
links from the best matching existing outputs. This removes fallback `out_1` to
`out_24` sockets while preserving restored links, including links from the fixed
`width`, `height`, and `User_prompt` outputs.

Output matching priority:

1. Matching `__mAI_MainInputV02_fieldId`
2. Matching output name and type
3. Fallback output at the expected index only when it has links
4. Matching output name

When links move, `app.graph.links[linkId].origin_slot` is updated to the new
output index.

## Output Lifecycle

Adding a field appends one matching output socket after the fixed outputs.
Renaming a field updates the existing dynamic output name in place. Removing a
field intentionally removes only that field's widgets and output socket.

Renaming or removing dynamic fields must not affect the fixed `width` or
`height` or `User_prompt` outputs.

The Python backend exposes fixed outputs for `width`, `height`, and
`User_prompt`, followed by 24 wildcard fallback outputs for ComfyUI
compatibility. The frontend displays only the fixed outputs plus dynamic outputs
defined by `fields_config`.

## Image Status

`IMAGE` fields can be represented in the UI and serialized, but image tensor
loading is not implemented yet. Executing an `IMAGE` field raises a clear backend
error rather than faking image output with a string.

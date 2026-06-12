# mAI MainInputV02 Architecture

`mAI_MainInputV02` is a standalone ComfyUI main input/configuration node. It has
no connectable input sockets. Users add fields through frontend buttons, and
each field creates a visible widget plus a matching dynamic output socket.

Image and mask loading responsibilities have been completely removed and
delegated to `mAI_ImageLoader`. `mAI_MainInputV02` is strictly for scalar
parameters and text configuration.

The node also has fixed size state:

- `size_preset`: serialized dropdown widget
- `width`: serialized `INT` widget and fixed `INT` output
- `height`: serialized `INT` widget and fixed `INT` output
- `User_prompt`: serialized multiline `STRING` widget and fixed `STRING` output

Fixed outputs always appear first in this order:

1. `Width`
2. `Height`
3. `User_prompt`
4. `Aspect_ratio` (Mathematically calculated from width/height to snap to standard ratios like "16:9" or output custom integer ratios)

All outputs (fixed and dynamic) strictly enforce a standardized format: capitalized first letter with no spaces (spaces are replaced with underscores). Dynamic field names typed by the user are automatically sanitized.

Do not move fields_config.
Use fields_config only as hidden serialized data for dynamic scalar fields.

Dynamic field outputs start after them.

## Serialized State

The hidden `fields_config` widget is the source of truth for workflow save/load
and API export. It must remain present in `node.widgets` and serializable even
while hidden. Frontend layout code must treat it as protected state: it must
not be moved, removed, or used as a layout spacer. Dynamic fields and add-field
controls are rendered inside a single HTML `DOMWidget` appended after the fixed
widgets, so they do not become independent serialized state. Note: The live API 
schema preview and copy functions have been removed from the UI to save space, 
but API export behavior still relies entirely on `fields_config`.

`size_preset`, `width`, `height`, and `User_prompt` are ordinary serialized
widgets. API workflows can set them directly. When `size_preset` is `custom`,
the supplied `width` and `height` values are used. Non-custom presets resolve
to their mapped dimensions in the backend.

The backend `INPUT_TYPES` order is `size_preset`, `width`, `height`,
`User_prompt`, then `fields_config`. The frontend DOMWidget is added only
after those fixed backend widgets exist.

`User_prompt` is not stored in `fields_config`.

Each field stores:

- `id`: stable field identifier
- `name`: output/widget label
- `type`: `STRING`, `INT`, `FLOAT`, or `BOOLEAN`
- `value`: current field value

Per-node runtime state is stored on the node instance with
`__mAI_MainInputV02_*` properties. There is no shared field config, localStorage,
or sessionStorage.

## Frontend Modules

- `main_input_v02.js`: ComfyUI extension registration and node lifecycle hooks.
- `constants.js`: shared extension constants, size presets, fixed output
  descriptors, and field type maps.
- `field_config.js`: field parsing, validation, normalization, and
  serialization.
- `node_state.js`: hidden config widget access, per-node field state,
  warnings, and rebuild scheduling.
- `field_widgets.js`: fixed size widget callbacks, DOMWidget creation,
  HTML rendering of dynamic fields, resize behavior, and `rebuildFromConfig`.
- `output_sync.js`: output socket creation/removal/rename and link-preserving
  reload normalization.

## Reload Behavior

To prevent race conditions during ComfyUI reload, the frontend tracks a node-instance-specific restoration phase:
1. When `onConfigure` is invoked, it sets `node.__mAI_MainInputV02_restoring = true`.
2. This flag prevents the size preset, width, and height widget callbacks from triggering and overwriting each other when ComfyUI initializes their values from the saved JSON workflow.
3. Both `onNodeCreated` and `onConfigure` call `scheduleRestore(node)`, which implements a debounced 50ms timer.
4. When the timer fires, `restoreFromCurrentNodeState(node)` is executed, which resets `node.__mAI_MainInputV02_restoring = false` and performs a rebuild of the dynamic widgets and outputs.

By waiting 50ms, the restore pass ensures that ComfyUI has fully loaded all serialized widgets, established links, and set values.
The rebuild reads `fields_config`, normalizes the output sockets, and calls `renderDOMFields(node)` to recreate the HTML field list. Output normalization always emits fixed `Width`, `Height`, `User_prompt`, and `Aspect_ratio` descriptors first, then appends dynamic field descriptors.
If the fixed backend widgets are not present yet, the frontend does not add the
DOMWidget or rebuild HTML fields during that pass.

The rebuild does not remove outputs with `node.removeOutput()` in a broad loop. Instead, `normalizeOutputsAfterLoad` builds the expected output list and migrates links from the best matching existing outputs. This removes unlinked fallback `out_1` to `out_24` sockets while preserving restored links, including links from the fixed `Width`, `Height`, and `User_prompt` outputs. If an unexpected extra output still has restored links, it is appended instead of discarded.

Output matching priority:

1. Matching `__mAI_MainInputV02_fieldId`
2. Matching output name and type
3. Dynamic fallback output at the expected index only when it has links
4. Matching output name

When links move, `app.graph.links[linkId].origin_slot` is updated to the new
output index.

## Output Lifecycle

Adding a field appends one matching output socket after the fixed outputs.
Renaming a field updates the existing dynamic output name in place. Removing a
field intentionally removes only that field's widgets and output socket.

Renaming or removing dynamic fields must not affect the fixed `Width`, `Height`,
or `User_prompt` outputs.

The Python backend exposes fixed outputs for `Width`, `Height`, `User_prompt`, and
`Aspect_ratio`, followed by 24 wildcard fallback outputs for ComfyUI compatibility.
The frontend displays only the fixed outputs plus dynamic outputs defined by `fields_config`.

## Input Validation and Change Tracking

### IS_CHANGED
The node implements a custom `@classmethod IS_CHANGED` to ensure ComfyUI correctly detects updates and refreshes outputs. It hashes:
1. The state of all static widgets (`size_preset`, `width`, `height`, `User_prompt`).
2. The dynamic fields JSON configuration (`fields_config`).

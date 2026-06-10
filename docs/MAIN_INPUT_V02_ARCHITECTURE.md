# mAI MainInputV02 Architecture

`mAI_MainInputV02` is a standalone ComfyUI main input/configuration node. It has
no connectable input sockets. Users add fields through frontend buttons, and
each field creates a visible widget plus a matching dynamic output socket.

The node also has fixed size state:

- `size_preset`: serialized dropdown widget
- `width`: serialized `INT` widget and fixed `INT` output
- `height`: serialized `INT` widget and fixed `INT` output
- `User_prompt`: serialized multiline `STRING` widget and fixed `STRING` output
- `Main_image`: serialized image upload/select widget and fixed `IMAGE` output
- `API_mask_override_path`: serialized text widget for API mask override

Fixed outputs always appear first in this order:

1. `width`
2. `height`
3. `User_prompt`
4. `Main_image`
5. `Main_mask`

Dynamic field outputs start after them.

## Serialized State

The hidden `fields_config` widget is the source of truth for workflow save/load
and API export. Dynamic field widgets are marked with `serialize = false`, so
they do not become independent serialized state.

`size_preset`, `width`, `height`, `User_prompt`, `Main_image`, and
`API_mask_override_path` are ordinary serialized widgets. API workflows can set
them directly. When `size_preset` is `custom`, the supplied `width` and `height`
values are used. Non-custom presets resolve to their mapped dimensions in the
backend.

`User_prompt`, `Main_image`, and `API_mask_override_path` are not stored in
`fields_config`. `API_mask_override_path` is intentionally named as an API-only
override path so it is not confused with the fixed `Main_mask` output or the
normal mask editor data associated with `Main_image`.

Each field stores:

- `id`: stable field identifier
- `name`: output/widget label
- `type`: `STRING`, `DROPDOWN`, `INT`, `FLOAT`, or `BOOLEAN`
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
output sockets. Output normalization always emits fixed `width`, `height`,
`User_prompt`, `Main_image`, and `Main_mask` descriptors first, then appends
dynamic field descriptors.

The rebuild does not remove outputs with `node.removeOutput()` in a broad loop.
Instead, `normalizeOutputsAfterLoad` builds the expected output list and migrates
links from the best matching existing outputs. This removes unlinked fallback
`out_1` to `out_24` sockets while preserving restored links, including links
from the fixed `width`, `height`, `User_prompt`, `Main_image`, and `Main_mask`
outputs. If an unexpected extra output still has restored links, it is appended
instead of discarded.

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

Renaming or removing dynamic fields must not affect the fixed `width`, `height`,
`User_prompt`, `Main_image`, or `Main_mask` outputs.

The Python backend exposes fixed outputs for `width`, `height`, and
`User_prompt`, fixed outputs for `Main_image` and `Main_mask`, followed by 24
wildcard fallback outputs for ComfyUI compatibility. The frontend displays only
the fixed outputs plus dynamic outputs defined by `fields_config`.

## Image Status

The fixed `Main_image` widget stores a ComfyUI input filename and uses
ComfyUI's `image_upload` widget metadata so the frontend behaves like a regular
image upload/select widget where possible. API workflows set `Main_image` as a
filename string. Backend loading mirrors ComfyUI `LoadImage`: the node resolves
the filename with `folder_paths.get_annotated_filepath`, loads the image tensor,
and reads mask data from the selected image's alpha channel.

The fixed `API_mask_override_path` widget stores an optional filename string. It
is not an output, not a dynamic field, and not part of `fields_config`.

The fixed `Main_mask` output uses this priority:

1. If `API_mask_override_path` is filled, load that file and output it as
   `Main_mask`.
2. If `API_mask_override_path` is empty, use the regular ComfyUI `LoadImage`
   mask associated with `Main_image`, including alpha data saved by ComfyUI's
   mask editor.
3. If no mask exists, return an empty mask matching `Main_image` dimensions.

ComfyUI's `/upload/mask` route saves a painted mask into the alpha channel of
the referenced image. `Main_mask` follows the same convention as `LoadImage` by
outputting inverted alpha (`1 - alpha`) when alpha is present. Only when no
alpha/mask data exists does the node create an empty mask.

When `API_mask_override_path` points to a normal image file, the backend converts
it to luminance. When it points to an image with alpha, the backend uses alpha in
the same inverted convention as ComfyUI Load Image. If the override mask size
differs from `Main_image`, it is resized to `Main_image` dimensions.

`API_mask_override_path` must be a ComfyUI input filename such as `mask.png` or
`masks/mask.png`. Absolute local paths are rejected by default because accepting
arbitrary filesystem paths from workflow/API JSON would let a workflow read
local files outside ComfyUI's managed input directory. API callers should upload
or copy mask files into `ComfyUI/input` first, then pass the resulting filename.

Dynamic `IMAGE` and `MASK` fields are not supported. Only scalar field types (`STRING`, `DROPDOWN`, `INT`, `FLOAT`, and `BOOLEAN`) are supported.

If an old workflow or API export contains a dynamic `IMAGE` or `MASK` field in `fields_config`, backend validation will raise a descriptive `ValueError` explaining that dynamic `IMAGE`/`MASK` fields were removed and should be replaced by fixed `Main_image`/`Main_mask` outputs.

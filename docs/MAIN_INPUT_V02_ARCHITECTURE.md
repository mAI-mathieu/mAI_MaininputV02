# mAI MainInputV02 Architecture

`mAI_MainInputV02` is a standalone ComfyUI main input/configuration node. It has
no connectable input sockets. Users add fields through frontend buttons, and
each field creates a visible widget plus a matching dynamic output socket.

The node also has fixed size state:

- `size_preset`: serialized dropdown widget
- `width`: serialized `INT` widget and fixed `INT` output
- `height`: serialized `INT` widget and fixed `INT` output
- `User_prompt`: serialized multiline `STRING` widget and fixed `STRING` output
- `image` (labeled as `Main_image`): serialized image upload/select widget (internally named `"image"` for mask editor compatibility) and fixed `Main_image` output
- `Mask_override_image`: serialized image upload/select widget for overriding the main image mask

Fixed outputs always appear first in this order:

1. `width`
2. `height`
3. `User_prompt`
4. `Main_image`
5. `Main_mask`

Dynamic field outputs start after them.

## Serialized State

The hidden `fields_config` widget is the source of truth for workflow save/load
and API export. It must remain present in `node.widgets` and serializable even
while hidden. Frontend layout code must treat it as protected state: it must
not be moved, removed, used as an upload/image widget, or used as a layout
spacer. Dynamic field widgets are marked with `serialize = false`, so they do
not become independent serialized state.

`size_preset`, `width`, `height`, `User_prompt`, `image` (the internal name of the main image widget), and
`Mask_override_image` are ordinary serialized widgets. API workflows can set
them directly. When `size_preset` is `custom`, the supplied `width` and `height`
values are used. Non-custom presets resolve to their mapped dimensions in the
backend.

`User_prompt`, `Main_image`, and `Mask_override_image` are not stored in
`fields_config`. `Mask_override_image` is a regular image select/upload widget
that allows overriding the main image mask (e.g. by uploading a transparent PNG).

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
- `node_state.js`: hidden config widget access, per-node field state,
  fields_config recovery, canvas dirty marking, warnings, and rebuild
  scheduling.
- `field_widgets.js`: fixed size widget callbacks, fixed image/mask widget
  layout, fixed image/mask preview widgets, add/remove field controls, dynamic
  widget creation, widget relabeling, resize behavior, and `rebuildFromConfig`.
- `output_sync.js`: output socket creation/removal/rename and link-preserving
  reload normalization.

## Reload Behavior

To prevent race conditions during ComfyUI reload, the frontend tracks a node-instance-specific restoration phase:
1. When `onConfigure` is invoked, it sets `node.__mAI_MainInputV02_restoring = true`.
2. This flag prevents the size preset, width, and height widget callbacks from triggering and overwriting each other when ComfyUI initializes their values from the saved JSON workflow.
3. Both `onNodeCreated` and `onConfigure` call `scheduleRestore(node)`, which implements a debounced 50ms timer.
4. When the timer fires, `restoreFromCurrentNodeState(node)` is executed, which resets `node.__mAI_MainInputV02_restoring = false` and performs a rebuild of the dynamic widgets and outputs.

By waiting 50ms, the restore pass ensures that ComfyUI has fully loaded all serialized widgets, established links, and set values.
The rebuild reads `fields_config`, removes previous dynamic field widgets, recreates the visible field widgets, and normalizes the output sockets. Output normalization always emits fixed `width`, `height`, `User_prompt`, `Main_image`, and `Main_mask` descriptors first, then appends dynamic field descriptors.

The frontend also keeps the fixed image/mask UI grouped above the dynamic
field controls. The visual order is `image` (displayed as `Main_image`), its
non-serialized preview, its upload button, `Mask_override_image`, its optional
non-serialized preview, its upload button, then the dynamic field buttons and
dynamic scalar widgets. The upload buttons are per-widget controls labeled
`choose main image to upload` and `choose mask override to upload`.

The fixed image/mask previews are per-node runtime widgets only. They are not
stored in `fields_config`, do not add API inputs, and do not change backend
execution. If ComfyUI creates its own node-wide canvas image preview widget,
the frontend suppresses that duplicate and keeps `Main_image` as the node image
preview reference used by image actions such as the mask editor; selecting
`Mask_override_image` does not replace the `Main_image` preview reference.
Custom preview drawing scales the selected image to the node's available inner
width while preserving aspect ratio and capping height to a sane maximum.

Because ComfyUI restores serialized widget values from the widget list, image
layout reordering never moves the hidden `fields_config` widget and never uses
it as an upload candidate or reorder target. If a workflow was saved during the
older widget-order bug, the frontend can temporarily recover `fields_config`
from the mask widget during rebuild and write it back to the hidden config
widget.

The rebuild does not remove outputs with `node.removeOutput()` in a broad loop. Instead, `normalizeOutputsAfterLoad` builds the expected output list and migrates links from the best matching existing outputs. This removes unlinked fallback `out_1` to `out_24` sockets while preserving restored links, including links from the fixed `width`, `height`, `User_prompt`, `Main_image`, and `Main_mask` outputs. If an unexpected extra output still has restored links, it is appended instead of discarded.

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

The main image input widget is internally named `"image"` rather than `"Main_image"` because ComfyUI's core frontend mask editor (including `useMaskEditorLoader` and `updateNodeWithServerReferences` in the React frontend) has hardcoded lookups targeting widgets named exactly `"image"`. Utilizing `"image"` as the internal widget name ensures painted masks are correctly uploaded to ComfyUI's temp clipspace and persist/restore perfectly upon browser refreshes.

The UI displays the corresponding output socket as `"Main_image"`. In API workflows, callers must use `"image"` as the input key.

The fixed `image` widget stores a ComfyUI input filename and uses ComfyUI's `image_upload` widget metadata so the frontend behaves like a regular image upload/select widget. Backend loading mirrors ComfyUI `LoadImage`: the node resolves the filename with `folder_paths.get_annotated_filepath`, loads the image tensor, and reads mask data from the selected image's alpha channel (which contains the painted mask).

The fixed `Mask_override_image` widget stores an optional filename string (or `"none"`). It is not an output, not a dynamic field, and not part of `fields_config`.

The fixed `Main_mask` output uses this priority:

1. If `Mask_override_image` is selected (and not `"none"`), load that file and extract the mask from it.
2. If `Mask_override_image` is `"none"` (or empty), use the regular ComfyUI `LoadImage` mask associated with the main `image` (including alpha/mask data saved by ComfyUI's mask editor).
3. If no mask exists, return an empty mask matching the main `image` dimensions.

ComfyUI's `/upload/mask` route saves a painted mask into the alpha channel of the referenced image. `Main_mask` follows the same convention as `LoadImage` by outputting inverted alpha (`1 - alpha`) when alpha is present. Only when no alpha/mask data exists does the node create an empty mask.

When `Mask_override_image` points to a normal image file, the backend converts it to luminance. When it points to an image with alpha, the backend uses alpha in the same inverted convention as ComfyUI Load Image. If the override mask size differs from the main `image`, it is resized to the main `image` dimensions.

`Mask_override_image` must be a ComfyUI input filename such as `mask.png` or
`masks/mask.png`. Absolute local paths are rejected by default because accepting
arbitrary filesystem paths from workflow/API JSON would let a workflow read
local files outside ComfyUI's managed input directory. API callers should upload
or copy mask files into `ComfyUI/input` first, then pass the resulting filename.

Dynamic `IMAGE` and `MASK` fields are not supported. Only scalar field types (`STRING`, `DROPDOWN`, `INT`, `FLOAT`, and `BOOLEAN`) are supported.

If an old workflow or API export contains a dynamic `IMAGE` or `MASK` field in `fields_config`, backend validation will raise a descriptive `ValueError` explaining that dynamic `IMAGE`/`MASK` fields were removed and should be replaced by fixed `Main_image`/`Main_mask` outputs.

## Input Validation and Change Tracking

### VALIDATE_INPUTS
Since the node uses a custom dropdown list (choices populated from `list_input_images()`), ComfyUI automatically performs strict list-membership validation on incoming image choices. However, when using the built-in ComfyUI mask editor, the frontend updates the image widget's value to a temporary clipspace path (e.g., `clipspace/clipspace-painted-masked-xxx.png [temp]`), which is not in the initial dropdown list. This would trigger a "Value not in list" execution error.

To solve this, the node implements a custom `@classmethod VALIDATE_INPUTS` that:
1. Bypasses ComfyUI's default list-membership check on the server.
2. Accepts both regular input filenames and clipspace filenames created by the mask editor.
3. Checks if the file exists using `folder_paths.exists_annotated_filepath`.
4. Rejects arbitrary absolute local paths across all platforms (Windows/Unix) for safety to prevent reading files outside ComfyUI's managed paths.

### IS_CHANGED
The node implements a custom `@classmethod IS_CHANGED` to ensure ComfyUI correctly detects updates and refreshes outputs. It hashes:
1. The state of all static widgets (`size_preset`, `width`, `height`, `User_prompt`).
2. The dynamic fields JSON configuration (`fields_config`).
3. The content of the main `image` file and `Mask_override_image` file by resolving their annotated paths and reading the binary data. If file reading fails, it falls back to hashing the filenames.

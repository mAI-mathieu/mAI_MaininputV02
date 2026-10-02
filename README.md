# mAI MainInputV02

Standalone ComfyUI custom node pack containing:

- `mAI MainInputV02`: scalar size, prompt, and dynamic configuration outputs.
- `mAI ImageLoader`: image and mask loading.

The main input node stores its dynamic field definitions in a hidden
`fields_config` widget so workflows can save, reload, and export to API format
without manual JSON editing.

## Installation

Copy this folder into the ComfyUI `custom_nodes` folder and restart ComfyUI.
The nodes appear under `mAI/Input`.

No install script or heavy dependencies are required.

## mAI MainInputV02

- Internal name: `mAI_MainInputV02`
- Category: `mAI/Input`
- No connectable input sockets
- Four fixed outputs: `Width`, `Height`, `User_prompt`, and `Aspect_ratio`
- Up to 24 dynamic scalar outputs

### Fixed widgets

- `size_preset`: chooses a preset or `custom`.
- `width`: custom base width.
- `height`: custom base height.
- `User_prompt`: multiline string.
- `size_multiplier`: float scale factor; default `1.0`, minimum `0.01`.
- `divisible_by`: integer rounding divisor; default `0`, minimum `0`.

Existing workflows that do not contain the two new widgets use `1.0` and `0`,
so their resulting dimensions remain unchanged.
Saved legacy dropdown values `x1` through `x4` are converted to numeric factors
on reload. New API prompts should send a number for `size_multiplier`.

### Size resolution order

Final dimensions are calculated in this order:

1. Resolve the base dimensions from `size_preset`, `width`, and `height`.
2. Multiply both dimensions by `size_multiplier`.
3. If `divisible_by` is `2` or higher, round each dimension to the closest
   positive multiple of that value. Otherwise, round to the nearest whole pixel.
4. Return the adjusted dimensions from `Width` and `Height`.

`divisible_by` values `0` and `1` disable rounding. If a dimension is exactly
halfway between two multiples or whole pixels, the higher value is selected.
Both dimensions stay at least one pixel. A multiplier of `2` doubles width
and height; `1.5` scales them by 50%, and `0.5` halves them.

Examples:

- Custom `1024x768`, multiplier `2.0`, divisor `0` becomes `2048x1536`.
- Custom `1024x768`, multiplier `1.5`, divisor `0` becomes `1536x1152`.
- Custom `1000x755`, multiplier `2.0`, divisor `64` becomes `1984x1536`.
- Preset `3:4 portrait 896x1152`, multiplier `3.0`, divisor `0` becomes `2688x3456`.

Selecting a non-custom preset updates the visible `width` and `height`.
Editing either dimension manually switches the preset back to `custom`.

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

### Dynamic fields

Use the controls inside the node to add:

- `STRING`
- `INT`
- `FLOAT`
- `BOOLEAN`

Each field creates a visible value control, a matching output socket, and a
serialized entry in `fields_config`. Dynamic outputs always follow the four
fixed outputs. Dynamic `IMAGE` and `MASK` fields are not supported; use
`mAI ImageLoader` for those values.

## mAI ImageLoader

Image and mask loading remains isolated in `mAI_ImageLoader`. It exposes fixed
`IMAGE` and `MASK` outputs, supports the regular ComfyUI mask editor, and
supports a separate `Mask_override_image`. The size-control changes in
`mAI_MainInputV02` do not alter image or mask behavior.

## API export

The Python backend declares:

```text
Width, Height, User_prompt, Aspect_ratio, out_1 ... out_24
```

The frontend replaces the wildcard output names and types with the dynamic
fields stored in `fields_config`.

API inputs for `mAI_MainInputV02` are:

- `size_preset`
- `width`
- `height`
- `User_prompt`
- `fields_config`
- `size_multiplier`
- `divisible_by`

For compatibility, API clients may omit `size_multiplier` and `divisible_by`;
the backend defaults to `1.0` and `0`. API inputs use a numeric float multiplier.

Example:

```json
{
  "size_preset": "custom",
  "width": 1000,
  "height": 755,
  "User_prompt": "a cinematic portrait",
  "fields_config": "[]",
  "size_multiplier": 2.0,
  "divisible_by": 64
}
```

This returns `Width=1984` and `Height=1536`.

## Testing

Run the pure Python suite from this repository:

```powershell
python -m unittest discover -s tests -v
```

Run the frontend multiplier migration checks with Node.js:

```powershell
node --test tests/test_size_multiplier.mjs
```

ComfyUI smoke test:

1. Restart ComfyUI and add `mAI MainInputV02`.
2. Confirm `size_multiplier` is a numeric float widget defaulting to `1.0`.
3. Confirm `divisible_by` defaults to `0` and does not accept negative values.
4. Set custom `1000x755`, multiplier `2.0`, and divisor `64`; run the workflow and confirm
   `Width=1984` and `Height=1536`.
5. Select a preset and confirm the multiplier applies to the preset dimensions.
6. Save and reload a workflow; confirm static widgets, dynamic fields, output
   sockets, and links are preserved.
7. Try custom `1024x768`, multiplier `1.5`, divisor `0` and confirm `1536x1152`.
   Load an older workflow and confirm missing controls default to `1.0` and `0`,
   and saved `x2` becomes numeric `2`.
8. Smoke-test `mAI ImageLoader` separately to confirm image and mask behavior
   remains unchanged.

## Known limitations

- Maximum of 24 dynamic fields.
- Fixed outputs cannot be removed or renamed.
- Removing a dynamic field removes its output socket and may remove links from
  that socket.
- Very large multipliers can produce dimensions that require substantial VRAM
  in downstream nodes.

# mAI_ImageLoader Architecture

## Overview

The `mAI_ImageLoader` is a specialized, extracted version of the image input functionality originally found in `mAI_MainInputV02`. It is designed to act purely as an image ingestion point in ComfyUI workflows, supporting a main image input and an optional mask override input. 

## Python Backend (`image_loader.py`)

- **"none" Handling**: The node is strictly built to tolerate the pseudo-value `"none"` for both image widgets. 
  - If `image` is `"none"`, it falls back to a 512x512 zero-tensor for the image, and a 512x512 zero-tensor for the mask. This is to avoid hard crashing the ComfyUI execution graph when inputs are temporarily cleared or unlinked.
  - If `Mask_override_image` is `"none"`, it falls back to using the alpha channel (or an all-ones tensor) from the main `image`.
- **Validation**: Includes custom `@classmethod VALIDATE_INPUTS` to prevent absolute paths and ensure security.
- **Change Detection**: Hashes the image files in `@classmethod IS_CHANGED` when they are present and valid, ensuring the node execution accurately triggers when the user uploads or switches to a modified image on disk.

## Frontend UI (`image_loader.js`)

The frontend uses a Hybrid UI Architecture combining native LiteGraph/ComfyUI components and a custom `DOMWidget`.

- **Mask Override Upload**: ComfyUI's standard `image` widget combo boxes do not natively allow uploading directly into a *second* widget if they're named differently or behaving peculiarly. We inject an explicit `📁 Upload Mask Override` button that silently uses an HTML `<input type="file">` to post the mask to the `/upload/image` API endpoint, appending the resulting filename to the combo box options and selecting it.
- **Mathematical Resizing**: The node incorporates a custom DOMWidget containing the "API Schema" accordion and the Node ID footer. Because we must ensure the ComfyUI native image preview (which renders *below* all widgets) does not get overlapped by HTML DOM elements, the node calculates its `size[1]` explicitly.
  - It intercepts `onResize` and `computeSize` to force the `container.style.height` and `node.size[1]` to accommodate the exact height of the API accordion (whether open or closed).

## Migration Notes
This node was built using an "Additive First" refactor pattern. It extracts logic from `mAI_MainInputV02` without deleting it from the original node, allowing both to co-exist for backward compatibility in the short-term until users migrate their workflows to the new standalone `mAI_ImageLoader`.

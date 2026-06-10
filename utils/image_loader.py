import os

IMAGE_EXTENSIONS = {
    ".bmp",
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".webp",
}


def list_input_images():
    try:
        import folder_paths
    except ImportError:
        return []

    input_dir = folder_paths.get_input_directory()
    try:
        filenames = os.listdir(input_dir)
    except OSError:
        return []

    if hasattr(folder_paths, "filter_files_content_types"):
        filenames = folder_paths.filter_files_content_types(filenames, ["image"])
    else:
        filenames = [
            filename
            for filename in filenames
            if _is_supported_image_file(input_dir, filename)
        ]

    return sorted(filenames)


def load_image_tensor(filename, field_name=None):
    images, _masks, _w, _h = load_image_and_editor_mask(filename)
    return images


def load_mask_tensor(filename, field_name=None):
    _images, masks, _w, _h = load_image_and_editor_mask(filename)
    return masks


def load_image_and_mask_tensors(filename, field_name=None):
    img, mask, _w, _h = load_image_and_editor_mask(filename)
    return img, mask


def load_mask_override_tensor(filename, field_name=None, target_size=None):
    target_width = target_size[0] if target_size else None
    target_height = target_size[1] if target_size else None
    return load_mask_override(filename, target_width, target_height)


def load_image_and_editor_mask(filename):
    if not filename:
        raise ValueError("Main_image requires an image filename.")

    # Try to use official ComfyUI LoadImage node to load the image/mask
    try:
        import nodes
        load_image_node = nodes.LoadImage()
        image_tensor, mask_tensor = load_image_node.load_image(filename)
        
        batch, height, width, _channels = image_tensor.shape
        # Check if the returned mask is the 64x64 empty placeholder
        # and if the image has different dimensions, return a proper size empty mask.
        if mask_tensor.shape[1] == 64 and mask_tensor.shape[2] == 64 and (height != 64 or width != 64):
            import torch
            mask_tensor = torch.zeros((batch, height, width), dtype=image_tensor.dtype, device=image_tensor.device)
            
        return image_tensor, mask_tensor, width, height
    except Exception:
        # Fallback to our own Pillow-based loader mirroring official LoadImage
        return _fallback_load_image_and_editor_mask(filename)


def _fallback_load_image_and_editor_mask(filename):
    folder_paths, image_module, image_ops, image_sequence, np, torch = _load_dependencies()
    image_path = _resolve_image_path(folder_paths, filename, "image")
    dtype, device = _runtime_tensor_settings(torch)

    images = []
    masks = []
    with _pillow_open(image_module, image_path) as image:
        first_size = None
        for frame in image_sequence.Iterator(image):
            frame = _pillow_call(image_ops.exif_transpose, frame)

            rgb_image = frame.convert("RGB")
            if first_size is None:
                first_size = rgb_image.size
            elif rgb_image.size != first_size:
                continue

            image_array = np.array(rgb_image).astype(np.float32) / 255.0
            images.append(torch.from_numpy(image_array)[None,].to(dtype=dtype, device=device))

            # Get editor mask (alpha) or empty mask matching image size
            if "A" in frame.getbands():
                mask_image = frame.getchannel("A")
                mask_array = 1.0 - np.array(mask_image).astype(np.float32) / 255.0
            elif frame.mode == "P" and "transparency" in frame.info:
                mask_image = frame.convert("RGBA").getchannel("A")
                mask_array = 1.0 - np.array(mask_image).astype(np.float32) / 255.0
            else:
                mask_array = np.zeros((rgb_image.size[1], rgb_image.size[0]), dtype=np.float32)

            masks.append(torch.from_numpy(mask_array)[None,].to(dtype=dtype, device=device))

    if not images:
        raise ValueError(f"Main_image '{filename}' did not contain any frames.")

    image_tensor = torch.cat(images, dim=0)
    mask_tensor = _stack_masks(torch, masks)
    width, height = first_size

    return image_tensor, mask_tensor, width, height


def load_mask_override(filename, target_width, target_height):
    if not filename or filename == "none":
        raise ValueError("Mask_override_image requires a valid filename.")

    folder_paths, image_module, image_ops, image_sequence, np, torch = _load_dependencies()
    image_path = _resolve_image_path(folder_paths, filename, "Mask_override_image")
    dtype, device = _runtime_tensor_settings(torch)

    masks = []
    with _pillow_open(image_module, image_path) as image:
        for frame in image_sequence.Iterator(image):
            frame = _pillow_call(image_ops.exif_transpose, frame)
            
            # Check if alpha exists
            if "A" in frame.getbands():
                mask_image = frame.getchannel("A")
                invert = True
            elif frame.mode == "P" and "transparency" in frame.info:
                mask_image = frame.convert("RGBA").getchannel("A")
                invert = True
            else:
                # Use luminance
                mask_image = frame.convert("L")
                invert = False

            # Resize to target size if dimensions differ
            if (target_width and target_height) and mask_image.size != (target_width, target_height):
                mask_image = mask_image.resize((target_width, target_height), _resampling_lanczos(image_module))

            mask_array = np.array(mask_image).astype(np.float32) / 255.0
            if invert:
                mask_array = 1.0 - mask_array

            masks.append(torch.from_numpy(mask_array)[None,].to(dtype=dtype, device=device))

    if not masks:
        raise ValueError(f"Mask_override_image '{filename}' did not contain any frames.")

    return _stack_masks(torch, masks)


def _load_image_and_masks(
    filename,
    field_name,
    mask_mode,
    target_size=None,
    use_comfy_loader=False,
):
    if not filename:
        raise ValueError(f"Field '{field_name}' requires an image filename.")

    folder_paths, image_module, image_ops, image_sequence, np, torch = _load_dependencies()
    image_path = _resolve_image_path(folder_paths, filename, field_name)
    dtype, device = _runtime_tensor_settings(torch)

    if use_comfy_loader and mask_mode == "alpha_or_empty":
        loaded = _load_with_comfy_video_loader(image_path, torch, dtype, device)
        if loaded is not None:
            return loaded

    images = []
    masks = []
    with _pillow_open(image_module, image_path) as image:
        first_size = None
        for frame in image_sequence.Iterator(image):
            frame = _pillow_call(image_ops.exif_transpose, frame)

            rgb_image = frame.convert("RGB")
            if first_size is None:
                first_size = rgb_image.size
            elif rgb_image.size != first_size:
                continue

            image_array = np.array(rgb_image).astype(np.float32) / 255.0
            images.append(torch.from_numpy(image_array)[None,].to(dtype=dtype, device=device))

            mask_array = _mask_array_for_frame(
                frame,
                rgb_image.size,
                mask_mode,
                target_size,
                np,
                image_module,
            )
            masks.append(torch.from_numpy(mask_array)[None,].to(dtype=dtype, device=device))

    if not images:
        raise ValueError(f"Field '{field_name}' image '{filename}' did not contain any frames.")

    return torch.cat(images, dim=0), _stack_masks(torch, masks)


def _load_dependencies():
    try:
        import folder_paths
        import numpy as np
        import torch
        from PIL import Image, ImageOps, ImageSequence
    except ImportError as exc:
        raise RuntimeError(
            "IMAGE and MASK fields require ComfyUI runtime dependencies: "
            "folder_paths, Pillow, numpy, and torch."
        ) from exc

    return folder_paths, Image, ImageOps, ImageSequence, np, torch


def _runtime_tensor_settings(torch):
    try:
        import comfy.model_management
    except ImportError:
        return torch.float32, "cpu"

    return (
        comfy.model_management.intermediate_dtype(),
        comfy.model_management.intermediate_device(),
    )


def _load_with_comfy_video_loader(image_path, torch, dtype, device):
    try:
        from comfy_api.latest import InputImpl
    except ImportError:
        return None

    try:
        components = InputImpl.VideoFromFile(image_path).get_components()
    except Exception:
        return None

    if components.images.shape[0] <= 0:
        return None

    images = components.images.to(device=device, dtype=dtype)
    if components.alpha is not None:
        # Mirrors ComfyUI LoadImage: mask editor uploads are saved into alpha,
        # and LoadImage exposes MASK as inverted alpha.
        masks = (1.0 - components.alpha[..., -1]).to(device=device, dtype=dtype)
    else:
        masks = torch.zeros(images.shape[:-1], dtype=dtype, device=device)

    return images, masks


def _pillow_open(image_module, image_path):
    try:
        import node_helpers
    except ImportError:
        return image_module.open(image_path)

    return node_helpers.pillow(image_module.open, image_path)


def _pillow_call(function, *args):
    try:
        import node_helpers
    except ImportError:
        return function(*args)

    return node_helpers.pillow(function, *args)


def _is_supported_image_file(input_dir, filename):
    path = os.path.join(input_dir, filename)
    _root, extension = os.path.splitext(filename)
    return os.path.isfile(path) and extension.lower() in IMAGE_EXTENSIONS


def _resolve_image_path(folder_paths, filename, field_name):
    if _is_absolute_path(filename):
        if field_name == "Mask_override_image":
            raise ValueError(
                "Mask_override_image must be a ComfyUI input filename, "
                "not an absolute local path.\n"
                "Put the mask image in ComfyUI/input or upload it through "
                "the ComfyUI API first, then use the uploaded filename.\n"
                f"Received: {filename}"
            )

        raise ValueError(
            f"Field '{field_name}' image filename must use ComfyUI input folder "
            f"handling, not an absolute path: {filename}"
        )

    try:
        image_path = folder_paths.get_annotated_filepath(filename)
    except Exception as exc:
        raise ValueError(
            f"Field '{field_name}' could not resolve image filename '{filename}' "
            "through ComfyUI input folder handling."
        ) from exc

    if not os.path.exists(image_path):
        raise FileNotFoundError(
            f"Field '{field_name}' image file was not found in ComfyUI inputs: {filename}"
        )

    return image_path


def _is_absolute_path(filename):
    if not filename:
        return False
    import posixpath
    import ntpath
    return (
        posixpath.isabs(filename)
        or ntpath.isabs(filename)
        or filename.startswith("/")
        or filename.startswith("\\")
    )


def _mask_array_for_frame(frame, image_size, mask_mode, target_size, np, image_module):
    if "A" in frame.getbands():
        mask_image = frame.getchannel("A")
        invert = True
    elif frame.mode == "P" and "transparency" in frame.info:
        mask_image = frame.convert("RGBA").getchannel("A")
        invert = True
    elif mask_mode == "alpha_or_luminance":
        mask_image = frame.convert("L")
        invert = False
    else:
        width, height = target_size or image_size
        return np.zeros((height, width), dtype=np.float32)

    if target_size and mask_image.size != target_size:
        mask_image = mask_image.resize(target_size, _resampling_lanczos(image_module))

    mask = np.array(mask_image).astype(np.float32) / 255.0
    if invert:
        return 1.0 - mask

    return mask


def _resampling_lanczos(image_module):
    resampling = getattr(image_module, "Resampling", None)
    if resampling:
        return resampling.LANCZOS

    return image_module.LANCZOS


def _stack_masks(torch, masks):
    return torch.cat(masks, dim=0)

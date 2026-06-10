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

    return sorted(
        filename
        for filename in filenames
        if _is_supported_image_file(input_dir, filename)
    )


def load_image_tensor(filename, field_name):
    images, _masks = load_image_and_mask_tensors(filename, field_name)
    return images


def load_mask_tensor(filename, field_name):
    _images, masks = load_image_and_mask_tensors(filename, field_name)
    return masks


def load_image_and_mask_tensors(filename, field_name):
    return _load_image_and_masks(filename, field_name, mask_mode="alpha_or_empty")


def load_mask_override_tensor(filename, field_name, target_size):
    _images, masks = _load_image_and_masks(
        filename,
        field_name,
        mask_mode="alpha_or_luminance",
        target_size=target_size,
    )
    return masks


def _load_image_and_masks(filename, field_name, mask_mode, target_size=None):
    if not filename:
        raise ValueError(f"Field '{field_name}' requires an image filename.")

    folder_paths, image_module, image_ops, image_sequence, np, torch = _load_dependencies()
    image_path = _resolve_image_path(folder_paths, filename, field_name)

    images = []
    masks = []
    with image_module.open(image_path) as image:
        for frame in image_sequence.Iterator(image):
            frame = image_ops.exif_transpose(frame)

            rgb_image = frame.convert("RGB")
            image_array = np.array(rgb_image).astype(np.float32) / 255.0
            images.append(torch.from_numpy(image_array)[None,])

            mask_array = _mask_array_for_frame(
                frame,
                rgb_image.size,
                mask_mode,
                target_size,
                np,
                image_module,
            )
            masks.append(torch.from_numpy(mask_array))

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


def _is_supported_image_file(input_dir, filename):
    path = os.path.join(input_dir, filename)
    _root, extension = os.path.splitext(filename)
    return os.path.isfile(path) and extension.lower() in IMAGE_EXTENSIONS


def _resolve_image_path(folder_paths, filename, field_name):
    if os.path.isabs(filename):
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


def _mask_array_for_frame(frame, image_size, mask_mode, target_size, np, image_module):
    if "A" in frame.getbands():
        mask_image = frame.getchannel("A")
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
    if len(masks) == 1:
        return masks[0]

    return torch.stack(masks, dim=0)

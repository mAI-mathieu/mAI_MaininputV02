import { api } from "../../../../scripts/api.js";
import { app } from "../../../../scripts/app.js";
import { CONFIG_WIDGET, DEFAULT_SIZE_PRESET, DEFAULT_WIDTH, DEFAULT_HEIGHT, MAX_FIELDS, SIZE_PRESETS } from "./constants.js";
import {
    normalizeBoolean,
    normalizeName,
    normalizeOptions,
    normalizeString,
    normalizeValue,
} from "./field_config.js";
import {
    getFieldState,
    hideFieldsConfigWidget,
    findNodeWidget,
    markCanvasDirty,
    readFieldsFromConfig,
    warn,
    writeFieldsConfig,
} from "./node_state.js";
import {
    addOutputForField,
    normalizeOutputsAfterLoad,
    removeOutputForField,
    updateOutputName,
} from "./output_sync.js";


let nextRuntimeId = 1;

const NATIVE_CANVAS_IMAGE_PREVIEW_WIDGET = "$$canvas-image-preview";
const IMAGE_PREVIEW_MIN_HEIGHT = 96;
const IMAGE_PREVIEW_MAX_HEIGHT = 320;
const IMAGE_PREVIEW_LOADING_HEIGHT = 160;
const IMAGE_PREVIEW_MARGIN = 15;

const STATIC_IMAGE_WIDGETS = [
    {
        widgetName: "image",
        displayName: "Main_image",
        previewWidgetName: "__mAI_MainInputV02_Main_image_preview",
        uploadLabel: "choose main image to upload",
        emptyValues: new Set([""]),
        keepNodeImagePreview: true,
    },
    {
        widgetName: "Mask_override_image",
        displayName: "Mask_override_image",
        previewWidgetName: "__mAI_MainInputV02_Mask_override_image_preview",
        uploadLabel: "choose mask override to upload",
        emptyValues: new Set(["", "none"]),
        keepNodeImagePreview: false,
    },
];

const FIELD_CONTROL_BUTTON_NAMES = ["+ String", "+ Dropdown", "+ Int", "+ Float", "+ Boolean"];


export function ensureControls(node) {
    setupFixedWidgets(node);
    hideFieldsConfigWidget(node);

    if (!node.__mAI_MainInputV02_controlsAdded) {
        node.__mAI_MainInputV02_controlsAdded = true;
        addButton(node, "+ String", () => addField(node, "STRING"));
        addButton(node, "+ Dropdown", () => addField(node, "DROPDOWN"));
        addButton(node, "+ Int", () => addField(node, "INT"));
        addButton(node, "+ Float", () => addField(node, "FLOAT"));
        addButton(node, "+ Boolean", () => addField(node, "BOOLEAN"));
    }

    syncStaticImageWidgets(node);
}


function setupFixedWidgets(node) {
    setupSizeWidgets(node);
    setupMainImageWidget(node);
    setupMaskOverrideImageWidget(node);
}


function setupSizeWidgets(node) {
    const sizePresetWidget = findNodeWidget(node, "size_preset");
    const widthWidget = findNodeWidget(node, "width");
    const heightWidget = findNodeWidget(node, "height");

    if (!sizePresetWidget || !widthWidget || !heightWidget) {
        return;
    }

    if (!sizePresetWidget.__mAI_MainInputV02_sizeCallback) {
        sizePresetWidget.__mAI_MainInputV02_sizeCallback = true;
        sizePresetWidget.callback = (value) => {
            if (node.__mAI_MainInputV02_restoring) {
                if (value !== undefined) {
                    sizePresetWidget.value = value;
                }
                return;
            }
            const presetName = normalizeString(value || DEFAULT_SIZE_PRESET);
            sizePresetWidget.value = presetName;
            applySizePreset(sizePresetWidget, widthWidget, heightWidget, presetName);
        };
    }

    if (!widthWidget.__mAI_MainInputV02_sizeCallback) {
        widthWidget.__mAI_MainInputV02_sizeCallback = true;
        widthWidget.callback = (value) => {
            if (node.__mAI_MainInputV02_restoring) {
                if (value !== undefined) {
                    widthWidget.value = value;
                }
                return;
            }
            widthWidget.value = normalizeValue(value ?? DEFAULT_WIDTH, "INT");
            sizePresetWidget.value = DEFAULT_SIZE_PRESET;
            markCanvasDirty();
        };
    }

    if (!heightWidget.__mAI_MainInputV02_sizeCallback) {
        heightWidget.__mAI_MainInputV02_sizeCallback = true;
        heightWidget.callback = (value) => {
            if (node.__mAI_MainInputV02_restoring) {
                if (value !== undefined) {
                    heightWidget.value = value;
                }
                return;
            }
            heightWidget.value = normalizeValue(value ?? DEFAULT_HEIGHT, "INT");
            sizePresetWidget.value = DEFAULT_SIZE_PRESET;
            markCanvasDirty();
        };
    }
}


function setupMainImageWidget(node) {
    setupImageWidget(node, STATIC_IMAGE_WIDGETS[0]);
}


function setupMaskOverrideImageWidget(node) {
    setupImageWidget(node, STATIC_IMAGE_WIDGETS[1], true);
}


function setupImageWidget(node, config, isMaskOverride = false) {
    const widget = findNodeWidget(node, config.widgetName);
    if (!widget) {
        return;
    }

    widget.label = config.displayName;
    widget.options ??= {};
    widget.options.image_upload = true;

    wrapImageWidgetCallback(node, widget, config);
    wrapNodeWidgetChanged(node);

    if (!widget.__mAI_MainInputV02_imageChoicesRefreshed) {
        widget.__mAI_MainInputV02_imageChoicesRefreshed = true;
        refreshImageChoices(widget, isMaskOverride);
    }
}


function wrapImageWidgetCallback(node, widget, config) {
    if (widget.callback === widget.__mAI_MainInputV02_wrappedImageCallback) {
        return;
    }

    const originalCallback = widget.callback;
    const wrappedCallback = function (...args) {
        let result;
        if (config.keepNodeImagePreview) {
            result = originalCallback?.apply(this, args);
        } else {
            markCanvasDirty();
        }

        scheduleStaticImageWidgetSync(node);
        return result;
    };

    widget.__mAI_MainInputV02_wrappedImageCallback = wrappedCallback;
    widget.__mAI_MainInputV02_originalImageCallback = originalCallback;
    widget.callback = wrappedCallback;
}


function wrapNodeWidgetChanged(node) {
    if (node.onWidgetChanged === node.__mAI_MainInputV02_wrappedOnWidgetChanged) {
        return;
    }

    const originalOnWidgetChanged = node.onWidgetChanged;
    const wrappedOnWidgetChanged = function (...args) {
        const result = originalOnWidgetChanged?.apply(this, args);
        const widgetName = args[0];
        const widget = args[3];
        if (isStaticImageWidgetName(widgetName) || isStaticImageWidgetName(widget?.name)) {
            scheduleStaticImageWidgetSync(node);
        }
        return result;
    };

    node.__mAI_MainInputV02_wrappedOnWidgetChanged = wrappedOnWidgetChanged;
    node.onWidgetChanged = wrappedOnWidgetChanged;
}


function isStaticImageWidgetName(name) {
    return STATIC_IMAGE_WIDGETS.some((config) => config.widgetName === name);
}


function scheduleStaticImageWidgetSync(node) {
    if (node.__mAI_MainInputV02_imageWidgetSyncTimer) {
        clearTimeout(node.__mAI_MainInputV02_imageWidgetSyncTimer);
    }

    node.__mAI_MainInputV02_imageWidgetSyncTimer = setTimeout(() => {
        node.__mAI_MainInputV02_imageWidgetSyncTimer = null;
        syncStaticImageWidgets(node);
        resizeNode(node);
    }, 0);
}


function applySizePreset(sizePresetWidget, widthWidget, heightWidget, presetName) {
    const preset = SIZE_PRESETS[presetName];
    if (!preset) {
        markCanvasDirty();
        return;
    }

    sizePresetWidget.value = presetName;
    widthWidget.value = preset.width;
    heightWidget.value = preset.height;
    markCanvasDirty();
}


export function addButton(node, name, callback) {
    const widget = node.addWidget("button", name, null, callback);
    widget.__mAI_MainInputV02_control = true;
    widget.serialize = false;
    return widget;
}


export function addField(node, type) {
    const fields = getFieldState(node);
    if (fields.length >= MAX_FIELDS) {
        warn(`Cannot add more than ${MAX_FIELDS} fields.`);
        return;
    }

    const field = createDefaultField(type, fields);
    fields.push(field);
    writeFieldsConfig(node, fields);
    addFieldWidgets(node, field);
    addOutputForField(node, field);
    syncStaticImageWidgets(node);
    resizeNode(node);
}


export function createDefaultField(type, fields) {
    const lowerType = type.toLowerCase();
    const index = nextFieldNameIndex(fields, lowerType);
    const field = {
        id: nextFieldId(fields),
        name: `${lowerType}_${index}`,
        type,
        value: "",
    };

    if (type === "DROPDOWN") {
        field.options = ["option_1", "option_2"];
        field.value = field.options[0];
    } else if (type === "INT") {
        field.value = 0;
    } else if (type === "FLOAT") {
        field.value = 0.0;
    } else if (type === "BOOLEAN") {
        field.value = false;
    }

    return field;
}


export function nextFieldNameIndex(fields, prefix) {
    let index = 1;
    const names = new Set(fields.map((field) => field.name));
    while (names.has(`${prefix}_${index}`)) {
        index += 1;
    }
    return index;
}


export function nextFieldId(fields) {
    const usedIds = new Set(fields.map((field) => field.id));
    let id = "";
    do {
        id = `field_${Date.now().toString(36)}_${nextRuntimeId++}`;
    } while (usedIds.has(id));
    return id;
}


export function addFieldWidgets(node, field) {
    node.__mAI_MainInputV02_fieldWidgets ??= {};

    const widgets = {};
    let nameWidget;
    nameWidget = node.addWidget("text", `${field.type} name`, field.name, (value) => {
        const nextName = normalizeName(value, field.name);
        field.name = nextName;
        nameWidget.value = nextName;
        updateOutputName(node, field.id, nextName);
        refreshFieldWidgetLabels(node, field);
        writeFieldsConfig(node, getFieldState(node));
        resizeNode(node);
    });
    tagFieldWidget(nameWidget, field.id);
    widgets.name = nameWidget;

    if (field.type === "STRING") {
        widgets.value = addStringValueWidget(node, `${field.name} value`, field.value, (value) => {
            field.value = normalizeString(value);
            writeFieldsConfig(node, getFieldState(node));
            resizeNode(node);
        });
        tagFieldWidget(widgets.value, field.id);
    } else if (field.type === "DROPDOWN") {
        widgets.options = node.addWidget(
            "text",
            `${field.name} options`,
            (field.options ?? []).join(", "),
            (value) => {
                field.options = normalizeOptions(value);
                if (!field.options.includes(field.value)) {
                    field.value = field.options[0] ?? "";
                }
                refreshDropdownWidget(widgets.selected, field);
                writeFieldsConfig(node, getFieldState(node));
            }
        );
        tagFieldWidget(widgets.options, field.id);

        widgets.selected = node.addWidget(
            "combo",
            `${field.name} value`,
            field.value,
            (value) => {
                field.value = normalizeString(value);
                writeFieldsConfig(node, getFieldState(node));
            },
            { values: field.options ?? [] }
        );
        tagFieldWidget(widgets.selected, field.id);
    } else if (field.type === "INT") {
        widgets.value = node.addWidget("number", `${field.name} value`, field.value, (value) => {
            field.value = normalizeValue(value, "INT");
            writeFieldsConfig(node, getFieldState(node));
        }, { precision: 0, step: 1 });
        tagFieldWidget(widgets.value, field.id);
    } else if (field.type === "FLOAT") {
        widgets.value = node.addWidget("number", `${field.name} value`, field.value, (value) => {
            field.value = normalizeValue(value, "FLOAT");
            writeFieldsConfig(node, getFieldState(node));
        }, { step: 0.01 });
        tagFieldWidget(widgets.value, field.id);
    } else if (field.type === "BOOLEAN") {
        widgets.value = node.addWidget("toggle", `${field.name} value`, field.value, (value) => {
            field.value = normalizeBoolean(value);
            writeFieldsConfig(node, getFieldState(node));
        });
        tagFieldWidget(widgets.value, field.id);
    }

    widgets.remove = node.addWidget("button", `Remove ${field.name}`, null, () => removeField(node, field.id));
    tagFieldWidget(widgets.remove, field.id);

    node.__mAI_MainInputV02_fieldWidgets[field.id] = widgets;
}


export function addStringValueWidget(node, name, value, callback) {
    return node.addWidget("text", name, value ?? "", callback);
}


async function refreshImageChoices(widget, isMaskOverride = false) {
    try {
        const response = await api.fetchApi("/object_info/LoadImage");
        const objectInfo = await response.json();
        let values = objectInfo?.LoadImage?.input?.required?.image?.[0] ?? [];
        if (isMaskOverride) {
            values = ["none", ...values.filter(v => v !== "none")];
        }
        widget.options ??= {};
        widget.options.values = withCurrentValue(values, widget.value);
        markCanvasDirty();
    } catch (error) {
        warn("Could not refresh ComfyUI input image list.", error);
    }
}


function withCurrentValue(values, currentValue) {
    const normalizedValues = Array.isArray(values) ? values : [];
    if (currentValue && !normalizedValues.includes(currentValue)) {
        return [currentValue, ...normalizedValues];
    }

    return normalizedValues;
}


export function tagFieldWidget(widget, fieldId) {
    widget.__mAI_MainInputV02_dynamicField = true;
    widget.__mAI_MainInputV02_fieldId = fieldId;
    widget.serialize = false;
    return widget;
}


export function refreshFieldWidgetLabels(node, field) {
    const widgets = node.__mAI_MainInputV02_fieldWidgets?.[field.id];
    if (!widgets) {
        return;
    }

    if (widgets.value) {
        widgets.value.name = `${field.name} value`;
    }
    if (widgets.options) {
        widgets.options.name = `${field.name} options`;
    }
    if (widgets.selected) {
        widgets.selected.name = `${field.name} value`;
    }
    if (widgets.remove) {
        widgets.remove.name = `Remove ${field.name}`;
    }
}


export function refreshDropdownWidget(widget, field) {
    if (!widget) {
        return;
    }

    widget.options ??= {};
    widget.options.values = field.options ?? [];
    widget.value = field.value;
}


export function removeField(node, fieldId) {
    const fields = getFieldState(node);
    const index = fields.findIndex((field) => field.id === fieldId);
    if (index < 0) {
        return;
    }

    fields.splice(index, 1);
    removeWidgetsForField(node, fieldId);
    removeOutputForField(node, fieldId, index);
    writeFieldsConfig(node, fields);
    syncStaticImageWidgets(node);
    resizeNode(node);
}


export function removeDynamicFieldWidgets(node) {
    if (!node.widgets) {
        return;
    }

    node.widgets = node.widgets.filter((widget) => widget.__mAI_MainInputV02_dynamicField !== true);
    node.__mAI_MainInputV02_fieldWidgets = {};
}


export function removeWidgetsForField(node, fieldId) {
    if (!node.widgets) {
        return;
    }

    node.widgets = node.widgets.filter((widget) => widget.__mAI_MainInputV02_fieldId !== fieldId);
    delete node.__mAI_MainInputV02_fieldWidgets?.[fieldId];
}


export function resizeNode(node) {
    const computedSize = node.computeSize?.();
    if (!computedSize) {
        markCanvasDirty();
        return;
    }

    const currentWidth = Array.isArray(node.size) ? node.size[0] : computedSize[0];
    node.setSize([Math.max(currentWidth, computedSize[0]), computedSize[1]]);
    markCanvasDirty();
}


export function rebuildFromConfig(node) {
    ensureControls(node);

    let fields;
    try {
        fields = readFieldsFromConfig(node);
    } catch (error) {
        warn("Invalid fields_config. Existing UI was left unchanged.", error);
        return;
    }

    node.__mAI_MainInputV02_fields = fields;
    removeDynamicFieldWidgets(node);
    for (const field of fields) {
        addFieldWidgets(node, field);
    }

    normalizeOutputsAfterLoad(node, fields);
    syncStaticImageWidgets(node);
    resizeNode(node);
}


function syncStaticImageWidgets(node) {
    ensureStaticImagePreviewWidgets(node);
    assignStaticImageUploadWidgets(node);
    suppressNativeCanvasImagePreview(node);
    refreshStaticImagePreviewWidgets(node);
    reorderStaticImageWidgets(node);
}


function ensureStaticImagePreviewWidgets(node) {
    if (!node.widgets) {
        return;
    }

    for (const config of STATIC_IMAGE_WIDGETS) {
        if (findNodeWidget(node, config.previewWidgetName)) {
            continue;
        }

        node.addCustomWidget(createImagePreviewWidget(node, config));
    }
}


function createImagePreviewWidget(node, config) {
    const widget = {
        type: "custom",
        name: config.previewWidgetName,
        value: "",
        y: 0,
        serialize: false,
        hidden: true,
        __mAI_MainInputV02_staticImagePreview: true,
        __mAI_MainInputV02_imageWidgetName: config.widgetName,
        __mAI_MainInputV02_keepNodeImagePreview: config.keepNodeImagePreview,
        computeSize(width) {
            return [width ?? node.size?.[0] ?? 210, getImagePreviewHeight(this, width)];
        },
        computeLayoutSize() {
            return {
                minHeight: Math.max(0, getImagePreviewHeight(this, node.size?.[0])),
                minWidth: 1,
            };
        },
        draw(ctx, drawNode, width, y, height) {
            drawImagePreviewWidget(ctx, drawNode, this, width, y, height);
        },
    };

    return widget;
}


function getImagePreviewHeight(widget, width) {
    if (widget.hidden || !widget.__mAI_MainInputV02_hasPreviewValue) {
        return -4;
    }

    const image = widget.__mAI_MainInputV02_previewImage;
    if (!image) {
        return IMAGE_PREVIEW_LOADING_HEIGHT;
    }

    const availableWidth = Math.max(1, (width ?? 210) - IMAGE_PREVIEW_MARGIN * 2);
    const scale = availableWidth / Math.max(1, image.naturalWidth || image.width || 1);
    const scaledHeight = (image.naturalHeight || image.height || IMAGE_PREVIEW_LOADING_HEIGHT) * scale;
    return Math.max(IMAGE_PREVIEW_MIN_HEIGHT, Math.min(IMAGE_PREVIEW_MAX_HEIGHT, scaledHeight + 12));
}


function drawImagePreviewWidget(ctx, node, widget, width, y, height) {
    if (widget.hidden || !widget.__mAI_MainInputV02_hasPreviewValue || height <= 0) {
        return;
    }

    const left = IMAGE_PREVIEW_MARGIN;
    const top = y + 4;
    const boxWidth = Math.max(1, width - IMAGE_PREVIEW_MARGIN * 2);
    const boxHeight = Math.max(1, height - 8);

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.beginPath();
    ctx.roundRect(left, top, boxWidth, boxHeight, 6);
    ctx.fill();
    ctx.stroke();

    const image = widget.__mAI_MainInputV02_previewImage;
    if (image) {
        if (widget.__mAI_MainInputV02_keepNodeImagePreview && node) {
            node.previewMediaType = "image";
            node.imgs = [image];
            node.imageIndex = 0;
        }

        const imageWidth = image.naturalWidth || image.width || 1;
        const imageHeight = image.naturalHeight || image.height || 1;
        const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
        const drawWidth = imageWidth * scale;
        const drawHeight = imageHeight * scale;
        const drawX = left + (boxWidth - drawWidth) / 2;
        const drawY = top + (boxHeight - drawHeight) / 2;
        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    }

    ctx.restore();
}


function assignStaticImageUploadWidgets(node) {
    if (!node.widgets) {
        return;
    }

    const candidates = node.widgets.filter(isStaticImageUploadCandidate);
    const unassigned = candidates.filter((widget) => !widget.__mAI_MainInputV02_staticImageUploadFor);

    for (const config of STATIC_IMAGE_WIDGETS) {
        let uploadWidget = candidates.find(
            (widget) => widget.__mAI_MainInputV02_staticImageUploadFor === config.widgetName
        );

        if (!uploadWidget) {
            uploadWidget = takeUploadCandidateForConfig(node, unassigned, config);
        }

        if (uploadWidget) {
            configureStaticImageUploadWidget(uploadWidget, config);
        }
    }
}


function isStaticImageUploadCandidate(widget) {
    if (!widget || widget.name === CONFIG_WIDGET || widget.type === "hidden" || widget.type !== "button") {
        return false;
    }
    if (widget.__mAI_MainInputV02_control || widget.__mAI_MainInputV02_dynamicField) {
        return false;
    }
    if (widget.__mAI_MainInputV02_staticImageUploadFor) {
        return true;
    }

    const name = normalizeString(widget.name).toLowerCase();
    const label = normalizeString(widget.label).toLowerCase();
    const value = normalizeString(widget.value).toLowerCase();

    return (
        value === "image" ||
        name === "upload" ||
        name.startsWith("upload_") ||
        name === "choose file to upload" ||
        label === "choose file to upload"
    );
}


function takeUploadCandidateForConfig(node, unassigned, config) {
    const selector = findNodeWidget(node, config.widgetName);
    const selectorIndex = node.widgets.indexOf(selector);
    if (selectorIndex < 0) {
        return unassigned.shift();
    }

    const nextSelectorIndex = STATIC_IMAGE_WIDGETS
        .map((candidateConfig) => findNodeWidget(node, candidateConfig.widgetName))
        .map((widget) => node.widgets.indexOf(widget))
        .filter((index) => index > selectorIndex)
        .sort((a, b) => a - b)[0] ?? Infinity;

    let candidateIndex = unassigned.findIndex((widget) => {
        const index = node.widgets.indexOf(widget);
        return index > selectorIndex && index < nextSelectorIndex;
    });

    if (candidateIndex < 0) {
        candidateIndex = unassigned.findIndex((widget) => node.widgets.indexOf(widget) > selectorIndex);
    }
    if (candidateIndex < 0) {
        candidateIndex = 0;
    }

    const [candidate] = unassigned.splice(candidateIndex, 1);
    return candidate;
}


function configureStaticImageUploadWidget(widget, config) {
    widget.__mAI_MainInputV02_staticImageUploadFor = config.widgetName;
    widget.name = config.uploadLabel;
    widget.label = config.uploadLabel;
    widget.localized_name = config.uploadLabel;
    widget.serialize = false;
}


function suppressNativeCanvasImagePreview(node) {
    if (!node.widgets) {
        return;
    }

    for (const widget of node.widgets) {
        if (widget.name !== NATIVE_CANVAS_IMAGE_PREVIEW_WIDGET) {
            continue;
        }

        widget.__mAI_MainInputV02_nativePreviewSuppressed = true;
        widget.hidden = true;
        widget.serialize = false;
        widget.computeSize = () => [0, -4];
        widget.computeLayoutSize = () => ({ minHeight: 0, minWidth: 0, maxHeight: 0, maxWidth: 0 });
    }
}


function refreshStaticImagePreviewWidgets(node) {
    for (const config of STATIC_IMAGE_WIDGETS) {
        const previewWidget = findNodeWidget(node, config.previewWidgetName);
        const selectorWidget = findNodeWidget(node, config.widgetName);
        if (!previewWidget || !selectorWidget) {
            continue;
        }

        refreshStaticImagePreviewWidget(node, previewWidget, selectorWidget, config);
    }
}


function refreshStaticImagePreviewWidget(node, previewWidget, selectorWidget, config) {
    const value = normalizeString(selectorWidget.value);
    const hasPreviewValue = Boolean(value) && !config.emptyValues.has(value);

    previewWidget.__mAI_MainInputV02_hasPreviewValue = hasPreviewValue;
    previewWidget.hidden = !hasPreviewValue;

    if (!hasPreviewValue) {
        previewWidget.__mAI_MainInputV02_previewValue = "";
        previewWidget.__mAI_MainInputV02_previewImage = null;
        previewWidget.__mAI_MainInputV02_previewLoading = false;
        if (config.keepNodeImagePreview) {
            node.images = undefined;
        }
        return;
    }

    const parsedValue = parseAnnotatedImageValue(value);
    if (config.keepNodeImagePreview) {
        node.previewMediaType = "image";
        node.images = parsedValue ? [{ ...parsedValue }] : undefined;
    }

    if (previewWidget.__mAI_MainInputV02_previewValue === value && previewWidget.__mAI_MainInputV02_previewImage) {
        return;
    }

    const url = imageValueToViewUrl(value);
    if (!url) {
        previewWidget.__mAI_MainInputV02_previewValue = value;
        previewWidget.__mAI_MainInputV02_previewImage = null;
        previewWidget.__mAI_MainInputV02_previewLoading = false;
        return;
    }

    const token = `${value}:${Date.now()}:${Math.random()}`;
    previewWidget.__mAI_MainInputV02_previewToken = token;
    previewWidget.__mAI_MainInputV02_previewValue = value;
    previewWidget.__mAI_MainInputV02_previewImage = null;
    previewWidget.__mAI_MainInputV02_previewLoading = true;

    const image = new Image();
    image.onload = () => {
        if (previewWidget.__mAI_MainInputV02_previewToken !== token) {
            return;
        }

        previewWidget.__mAI_MainInputV02_previewImage = image;
        previewWidget.__mAI_MainInputV02_previewLoading = false;
        if (config.keepNodeImagePreview) {
            node.imgs = [image];
            node.imageIndex = 0;
        }
        resizeNode(node);
        markCanvasDirty();
    };
    image.onerror = () => {
        if (previewWidget.__mAI_MainInputV02_previewToken !== token) {
            return;
        }

        previewWidget.__mAI_MainInputV02_previewImage = null;
        previewWidget.__mAI_MainInputV02_previewLoading = false;
        resizeNode(node);
        markCanvasDirty();
    };
    image.src = url;
}


function parseAnnotatedImageValue(value) {
    let path = normalizeString(value);
    if (!path || path === "none") {
        return null;
    }

    let type = "input";
    const annotation = path.match(/\s+\[(input|output|temp)\]$/i);
    if (annotation) {
        type = annotation[1].toLowerCase();
        path = path.slice(0, annotation.index).trim();
    }

    path = path.replace(/\\/g, "/");
    const slashIndex = path.lastIndexOf("/");
    const filename = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
    const subfolder = slashIndex >= 0 ? path.slice(0, slashIndex) : "";

    if (!filename) {
        return null;
    }

    return { filename, subfolder, type };
}


function imageValueToViewUrl(value) {
    const parsed = parseAnnotatedImageValue(value);
    if (!parsed) {
        return "";
    }

    const params = new URLSearchParams();
    params.set("filename", parsed.filename);
    params.set("type", parsed.type);
    params.set("subfolder", parsed.subfolder);

    const path = `/view?${params.toString()}`;
    if (typeof api.apiURL === "function") {
        return api.apiURL(path);
    }
    return path;
}


function reorderStaticImageWidgets(node) {
    if (!node.widgets) {
        return;
    }

    let target = findNodeWidget(node, "User_prompt") ?? findNodeWidget(node, "height");
    for (const config of STATIC_IMAGE_WIDGETS) {
        const selector = findNodeWidget(node, config.widgetName);
        const preview = findNodeWidget(node, config.previewWidgetName);
        const upload = node.widgets.find(
            (widget) => widget.__mAI_MainInputV02_staticImageUploadFor === config.widgetName
        );

        for (const widget of [selector, preview, upload]) {
            if (!widget) {
                continue;
            }
            if (target) {
                moveWidgetAfter(node, widget, target);
            }
            target = widget;
        }
    }

    for (const buttonName of FIELD_CONTROL_BUTTON_NAMES) {
        const button = node.widgets.find(
            (widget) => widget.__mAI_MainInputV02_control && widget.name === buttonName
        );
        if (!button) {
            continue;
        }
        if (target) {
            moveWidgetAfter(node, button, target);
        }
        target = button;
    }

    markCanvasDirty();
}


function moveWidgetAfter(node, widgetToMove, targetWidget) {
    if (!node.widgets || !widgetToMove || !targetWidget || widgetToMove === targetWidget) {
        return;
    }
    if (widgetToMove.name === CONFIG_WIDGET || targetWidget.name === CONFIG_WIDGET) {
        return;
    }

    const currentIndex = node.widgets.indexOf(widgetToMove);
    if (currentIndex < 0) {
        return;
    }

    node.widgets.splice(currentIndex, 1);
    const targetIndex = node.widgets.indexOf(targetWidget);
    if (targetIndex < 0) {
        node.widgets.splice(currentIndex, 0, widgetToMove);
        return;
    }

    node.widgets.splice(targetIndex + 1, 0, widgetToMove);
}


export function scheduleRestore(node) {
    if (node.__mAI_MainInputV02_restoreTimer) {
        clearTimeout(node.__mAI_MainInputV02_restoreTimer);
    }

    node.__mAI_MainInputV02_restoreTimer = setTimeout(() => {
        node.__mAI_MainInputV02_restoreTimer = null;
        restoreFromCurrentNodeState(node);
    }, 50);
}


export function restoreFromCurrentNodeState(node) {
    node.__mAI_MainInputV02_restoring = false;
    hideFieldsConfigWidget(node);
    rebuildFromConfig(node);
}

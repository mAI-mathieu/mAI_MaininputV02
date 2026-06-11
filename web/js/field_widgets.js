import { api } from "../../../../scripts/api.js";
import { app } from "../../../../scripts/app.js";
import { DEFAULT_SIZE_PRESET, DEFAULT_WIDTH, DEFAULT_HEIGHT, MAX_FIELDS, SIZE_PRESETS } from "./constants.js";
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


export function ensureControls(node) {
    setupFixedWidgets(node);
    hideFieldsConfigWidget(node);

    if (node.__mAI_MainInputV02_controlsAdded) {
        reorderWidgets(node);
        return;
    }

    node.__mAI_MainInputV02_controlsAdded = true;
    addButton(node, "+ String", () => addField(node, "STRING"));
    addButton(node, "+ Dropdown", () => addField(node, "DROPDOWN"));
    addButton(node, "+ Int", () => addField(node, "INT"));
    addButton(node, "+ Float", () => addField(node, "FLOAT"));
    addButton(node, "+ Boolean", () => addField(node, "BOOLEAN"));

    reorderWidgets(node);
}


function setupFixedWidgets(node) {
    setupSizeWidgets(node);
    setupMainImageWidget(node);
    setupApiMaskOverrideWidget(node);
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
    const widget = findNodeWidget(node, "Main_image");
    if (!widget) {
        return;
    }

    widget.options ??= {};
    widget.options.image_upload = true;

    if (!widget.__mAI_MainInputV02_imageChoicesRefreshed) {
        widget.__mAI_MainInputV02_imageChoicesRefreshed = true;
        refreshImageChoices(widget);
    }
}


function setupApiMaskOverrideWidget(node) {
    const widget = findNodeWidget(node, "API_mask_override_path");
    if (!widget || widget.__mAI_MainInputV02_apiMaskCallback) {
        return;
    }

    widget.__mAI_MainInputV02_apiMaskCallback = true;
    const previousCallback = widget.callback;
    widget.callback = (value, ...args) => {
        widget.value = normalizeString(value);
        previousCallback?.call(widget, widget.value, ...args);
        markCanvasDirty();
    };
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
    reorderWidgets(node);
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


async function refreshImageChoices(widget) {
    try {
        const response = await api.fetchApi("/object_info/LoadImage");
        const objectInfo = await response.json();
        const values = objectInfo?.LoadImage?.input?.required?.image?.[0] ?? [];
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
    reorderWidgets(node);
    resizeNode(node);
}


export function removeDynamicFieldWidgets(node) {
    if (!node.widgets) {
        return;
    }

    node.widgets = node.widgets.filter((widget) => !widget.__mAI_MainInputV02_dynamicField);
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
    reorderWidgets(node);
    resizeNode(node);
}


export function reorderWidgets(node) {
    if (!node.widgets) {
        return;
    }

    const size_preset = node.widgets.find((w) => w.name === "size_preset");
    const width = node.widgets.find((w) => w.name === "width");
    const height = node.widgets.find((w) => w.name === "height");
    const User_prompt = node.widgets.find((w) => w.name === "User_prompt");
    const image = node.widgets.find((w) => w.name === "image");
    const Mask_override_image = node.widgets.find((w) => w.name === "Mask_override_image");
    const fields_config = node.widgets.find((w) => w.name === "fields_config");

    // Extract all other widgets
    const otherWidgets = node.widgets.filter((w) =>
        w !== size_preset &&
        w !== width &&
        w !== height &&
        w !== User_prompt &&
        w !== image &&
        w !== Mask_override_image &&
        w !== fields_config
    );

    // Dynamic controls: "+ String", "+ Dropdown", etc.
    const dynamic_controls = otherWidgets.filter((w) => w.__mAI_MainInputV02_control);

    // Dynamic field widgets (name, value, remove buttons)
    const dynamic_widgets = otherWidgets.filter((w) => w.__mAI_MainInputV02_dynamicField);

    // Remaining widgets are upload buttons or previews created by ComfyUI
    const remaining = otherWidgets.filter((w) => !w.__mAI_MainInputV02_control && !w.__mAI_MainInputV02_dynamicField);

    // Find upload buttons among remaining
    const upload_buttons = remaining.filter((w) =>
        w.type === "button" &&
        (w.name?.toLowerCase().includes("choose") ||
         w.label?.toLowerCase().includes("choose") ||
         w.name?.toLowerCase().includes("upload") ||
         w.label?.toLowerCase().includes("upload"))
    );

    // Previews are remaining widgets that are NOT upload buttons
    const previews = remaining.filter((w) => !upload_buttons.includes(w));

    // Distribute upload buttons and previews to image and Mask_override_image
    // Since 'image' is processed first, the first upload button/preview belongs to 'image'
    // and the second belongs to 'Mask_override_image'
    const main_image_button = upload_buttons[0];
    const mask_override_button = upload_buttons[1];

    const main_image_preview = previews[0];
    const mask_override_preview = previews[1];

    // Rename buttons clearly
    if (main_image_button) {
        main_image_button.name = "choose main image to upload";
        main_image_button.label = "choose main image to upload";
    }
    if (mask_override_button) {
        mask_override_button.name = "choose mask override to upload";
        mask_override_button.label = "choose mask override to upload";
    }

    // Build the new ordered widgets array
    const ordered = [];

    if (size_preset) ordered.push(size_preset);
    if (width) ordered.push(width);
    if (height) ordered.push(height);
    if (User_prompt) ordered.push(User_prompt);

    if (image) ordered.push(image);
    if (main_image_preview) ordered.push(main_image_preview);
    if (main_image_button) ordered.push(main_image_button);

    if (Mask_override_image) ordered.push(Mask_override_image);
    if (mask_override_preview) ordered.push(mask_override_preview);
    if (mask_override_button) ordered.push(mask_override_button);

    // Add any remaining uncategorized widgets (just in case)
    for (const w of remaining) {
        if (w !== main_image_button && w !== mask_override_button && w !== main_image_preview && w !== mask_override_preview) {
            ordered.push(w);
        }
    }

    // Add dynamic controls
    ordered.push(...dynamic_controls);

    // Add dynamic widgets
    ordered.push(...dynamic_widgets);

    // Add fields_config at the very end
    if (fields_config) ordered.push(fields_config);

    node.widgets = ordered;
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

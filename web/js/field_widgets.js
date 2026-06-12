import { api } from "../../../../scripts/api.js";
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

function addStylesheet() {
    if (document.getElementById("mai-main-input-css")) return;
    const style = document.createElement("link");
    style.id = "mai-main-input-css";
    style.rel = "stylesheet";
    style.type = "text/css";
    style.href = new URL("../css/main_input.css", import.meta.url).href;
    document.head.appendChild(style);
}

const STATIC_IMAGE_WIDGETS = [
    {
        widgetName: "image",
        displayName: "Main_image",
    },
    {
        widgetName: "Mask_override_image",
        displayName: "Mask_override_image",
    },
];

const REQUIRED_FIXED_WIDGET_NAMES = [
    "size_preset",
    "width",
    "height",
    "User_prompt",
    "image",
    "Mask_override_image",
    CONFIG_WIDGET,
];


export function ensureControls(node) {
    setupFixedWidgets(node);
    hideFieldsConfigWidget(node);

    if (!fixedBackendWidgetsReady(node)) {
        markCanvasDirty();
        return false;
    }

    if (!node.__mAI_MainInputV02_domWidget) {
        addStylesheet();

        const container = document.createElement("div");
        container.className = "mai-dynamic-container";

        const stopProp = (e) => e.stopPropagation();
        container.addEventListener("pointerdown", stopProp);
        container.addEventListener("mousedown", stopProp);
        container.addEventListener("dblclick", stopProp);
        container.addEventListener("wheel", stopProp);
        container.addEventListener("keydown", stopProp);

        const listDiv = document.createElement("div");
        listDiv.className = "mai-dynamic-list";
        node.__mAI_MainInputV02_listDiv = listDiv;

        const addBar = document.createElement("div");
        addBar.className = "mai-add-bar";

        const typeSelect = document.createElement("select");
        typeSelect.className = "mai-add-select";
        const fieldTypes = [
            { value: "STRING", text: "📝 STRING" },
            { value: "DROPDOWN", text: "🔽 DROPDOWN" },
            { value: "INT", text: "🔢 INT" },
            { value: "FLOAT", text: "〰 FLOAT" },
            { value: "BOOLEAN", text: "☑ BOOLEAN" }
        ];
        fieldTypes.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t.value;
            opt.innerText = t.text;
            typeSelect.appendChild(opt);
        });

        const addBtn = document.createElement("button");
        addBtn.className = "mai-add-button";
        addBtn.innerText = "+ Add Field";
        addBtn.addEventListener("click", () => addField(node, typeSelect.value));

        addBar.appendChild(typeSelect);
        addBar.appendChild(addBtn);

        container.appendChild(listDiv);
        container.appendChild(addBar);

        const domWidget = node.addDOMWidget("mai_dynamic_fields", "div", container, { serialize: false, hideOnZoom: false });
        domWidget.computeSize = function(width) {
            const fields = node.__mAI_MainInputV02_fields || [];
            const contentHeight = fields.length === 0 ? 40 : (fields.length * 34) + 48;
            const finalHeight = Math.min(300, contentHeight);

            const currentWidth = node.size ? node.size[0] : width;
            const domWidth = Math.max(10, currentWidth - 30);

            if (container && container.style) {
                container.style.height = `${finalHeight}px`;
                container.style.minHeight = `${finalHeight}px`;
                container.style.width = `${domWidth}px`;
                container.style.maxWidth = `${domWidth}px`;
            }
            
            return [220, finalHeight]; // Safe minimum width
        };
        node.__mAI_MainInputV02_domWidget = domWidget;
        
        const originalOnResize = node.onResize;
        node.onResize = function(size) {
            const result = originalOnResize ? originalOnResize.apply(this, arguments) : undefined;
            if (container && container.style && size) {
                const domWidth = Math.max(10, size[0] - 30);
                container.style.width = `${domWidth}px`;
                container.style.maxWidth = `${domWidth}px`;
            }
            return result;
        };

        renderDOMFields(node);
    }

    markCanvasDirty();
    return true;
}


function setupFixedWidgets(node) {
    setupSizeWidgets(node);
    setupMainImageWidget(node);
    setupMaskOverrideImageWidget(node);
}


function fixedBackendWidgetsReady(node) {
    return REQUIRED_FIXED_WIDGET_NAMES.every((name) => findNodeWidget(node, name));
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

    if (!widget.__mAI_MainInputV02_imageChoicesRefreshed) {
        widget.__mAI_MainInputV02_imageChoicesRefreshed = true;
        refreshImageChoices(widget, isMaskOverride);
    }
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


export function renderDOMFields(node) {
    if (!node.__mAI_MainInputV02_listDiv) return;

    const listDiv = node.__mAI_MainInputV02_listDiv;
    listDiv.innerHTML = "";

    const fields = getFieldState(node);
    for (const field of fields) {
        const row = document.createElement("div");
        row.className = "mai-field-row";

        const nameInput = document.createElement("input");
        nameInput.className = "mai-field-name";
        nameInput.type = "text";
        nameInput.value = field.name;
        nameInput.addEventListener("change", (e) => {
            const nextName = normalizeName(e.target.value, field.name);
            field.name = nextName;
            e.target.value = nextName;
            updateOutputName(node, field.id, nextName);
            writeFieldsConfig(node, getFieldState(node));
        });

        row.appendChild(nameInput);

        if (field.type === "BOOLEAN") {
            const valInput = document.createElement("input");
            valInput.className = "mai-field-value";
            valInput.type = "checkbox";
            valInput.checked = field.value;
            valInput.addEventListener("change", (e) => {
                field.value = normalizeBoolean(e.target.checked);
                writeFieldsConfig(node, getFieldState(node));
            });
            row.appendChild(valInput);
        } else if (field.type === "DROPDOWN") {
            const valContainer = document.createElement("div");
            valContainer.style.display = "flex";
            valContainer.style.flexDirection = "column";
            valContainer.style.gap = "2px";
            
            const optInput = document.createElement("input");
            optInput.className = "mai-field-value";
            optInput.type = "text";
            optInput.placeholder = "options (comma separated)";
            optInput.value = (field.options ?? []).join(", ");
            
            const selInput = document.createElement("select");
            selInput.className = "mai-field-value";
            (field.options ?? []).forEach(opt => {
                const o = document.createElement("option");
                o.value = opt;
                o.innerText = opt;
                selInput.appendChild(o);
            });
            selInput.value = field.value;

            optInput.addEventListener("change", (e) => {
                field.options = normalizeOptions(e.target.value);
                if (!field.options.includes(field.value)) {
                    field.value = field.options[0] ?? "";
                }
                writeFieldsConfig(node, getFieldState(node));
                renderDOMFields(node);
            });

            selInput.addEventListener("change", (e) => {
                field.value = normalizeString(e.target.value);
                writeFieldsConfig(node, getFieldState(node));
            });

            valContainer.appendChild(optInput);
            valContainer.appendChild(selInput);
            row.appendChild(valContainer);
        } else {
            const valInput = document.createElement("input");
            valInput.className = "mai-field-value";
            if (field.type === "INT" || field.type === "FLOAT") {
                valInput.type = "number";
                valInput.step = field.type === "INT" ? "1" : "0.01";
            } else {
                valInput.type = "text";
            }
            valInput.value = field.value;
            valInput.addEventListener("change", (e) => {
                if (field.type === "INT" || field.type === "FLOAT") {
                    field.value = normalizeValue(e.target.value, field.type);
                } else {
                    field.value = normalizeString(e.target.value);
                }
                writeFieldsConfig(node, getFieldState(node));
            });
            row.appendChild(valInput);
        }

        const rmBtn = document.createElement("button");
        rmBtn.className = "mai-field-remove";
        rmBtn.innerText = "✖";
        rmBtn.addEventListener("click", () => removeField(node, field.id));
        row.appendChild(rmBtn);

        listDiv.appendChild(row);
    }

    requestAnimationFrame(() => {
        resizeNode(node);
    });
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
    addOutputForField(node, field);
    renderDOMFields(node);
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


export function removeField(node, fieldId) {
    const fields = getFieldState(node);
    const index = fields.findIndex((field) => field.id === fieldId);
    if (index < 0) {
        return;
    }

    fields.splice(index, 1);
    removeOutputForField(node, fieldId, index);
    writeFieldsConfig(node, fields);
    renderDOMFields(node);
    resizeNode(node);
}


export function resizeNode(node) {
    const computedSize = node.computeSize?.();
    if (!computedSize || !node.size) {
        markCanvasDirty();
        return;
    }

    // Directly set the height. Do NOT use node.setSize() because LiteGraph 
    // forces the width to expand to the image preview's natural resolution.
    node.size[1] = computedSize[1];
    markCanvasDirty();
}


export function rebuildFromConfig(node) {
    if (!ensureControls(node)) {
        return;
    }

    let fields;
    try {
        fields = readFieldsFromConfig(node);
    } catch (error) {
        warn("Invalid fields_config. Existing UI was left unchanged.", error);
        return;
    }

    node.__mAI_MainInputV02_fields = fields;
    normalizeOutputsAfterLoad(node, fields);
    renderDOMFields(node);
    resizeNode(node);
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

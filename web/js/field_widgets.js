import { api } from "../../../../scripts/api.js";
import { app } from "../../../../scripts/app.js";
import { CONFIG_WIDGET, DEFAULT_SIZE_PRESET, DEFAULT_WIDTH, DEFAULT_HEIGHT, MAX_FIELDS, SIZE_PRESETS } from "./constants.js";
import {
    capitalizeFirstLetter,
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


const REQUIRED_FIXED_WIDGET_NAMES = [
    "size_preset",
    "width",
    "height",
    "User_prompt",
    CONFIG_WIDGET,
    "size_multiplier",
    "divisible_by",
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
            let contentHeight = 85; // Base padding + Add Bar + Footer
            
            // Add fields height
            for (const f of fields) {
                contentHeight += (f.type === "STRING") ? 60 : 34;
            }
            

            
            const containerHeight = Math.min(800, contentHeight);

            const currentWidth = node.size ? node.size[0] : width;
            const domWidth = Math.max(10, currentWidth - 30);

            if (container && container.style) {
                container.style.height = `${containerHeight}px`;
                container.style.minHeight = `${containerHeight}px`;
                container.style.width = `${domWidth}px`;
                container.style.maxWidth = `${domWidth}px`;
            }
            
            return [220, containerHeight + 10]; // Safe minimum width
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
    setupUserPromptWidget(node);
}

function setupUserPromptWidget(node) {
    const widget = findNodeWidget(node, "User_prompt");
    if (!widget || !widget.inputEl) return;

    widget.inputEl.style.resize = "none";
    widget.inputEl.style.overflow = "hidden";

    const autoResize = () => {
        // Reset to auto to measure true scrollHeight
        widget.inputEl.style.height = "auto";
        const scrollHeight = widget.inputEl.scrollHeight;
        const newHeight = Math.max(40, scrollHeight);

        // Set the actual DOM element height
        widget.inputEl.style.height = newHeight + "px";

        // IMPORTANT: Tell LiteGraph the new height of this specific widget 
        // so it pushes the subsequent widgets (like Main_image) down.
        widget.computeSize = function(width) {
            return [width, newHeight + 10]; // +10 for comfortable padding
        };

        // Trigger our safe vertical-only resize function
        resizeNode(node);
    };

    widget.inputEl.addEventListener("input", autoResize);
    
    // Trigger once on load to set the initial height correctly
    requestAnimationFrame(() => autoResize());
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
    fields.forEach((field, index) => {
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
        } else if (field.type === "STRING") {
            const valInput = document.createElement("textarea");
            valInput.className = "mai-field-value";
            valInput.style.resize = "none";
            valInput.style.height = "54px"; // Approximately 3 lines
            valInput.spellcheck = false;
            valInput.value = field.value || "";
            valInput.addEventListener("input", (e) => {
                field.value = normalizeString(e.target.value);
                writeFieldsConfig(node, getFieldState(node));
                markCanvasDirty();
            });
            row.appendChild(valInput);
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

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "mai-field-actions";

        const upBtn = document.createElement("button");
        upBtn.className = "mai-action-btn";
        upBtn.innerText = "▲";
        upBtn.disabled = index === 0;
        upBtn.addEventListener("click", () => moveField(node, index, -1));

        const downBtn = document.createElement("button");
        downBtn.className = "mai-action-btn";
        downBtn.innerText = "▼";
        downBtn.disabled = index === fields.length - 1;
        downBtn.addEventListener("click", () => moveField(node, index, 1));

        const rmBtn = document.createElement("button");
        rmBtn.className = "mai-action-btn remove";
        rmBtn.innerText = "✖";
        rmBtn.addEventListener("click", () => removeField(node, field.id));

        actionsDiv.appendChild(upBtn);
        actionsDiv.appendChild(downBtn);
        actionsDiv.appendChild(rmBtn);
        row.appendChild(actionsDiv);

        listDiv.appendChild(row);
    });

    const container = listDiv.parentElement;
    const existingFooter = container.querySelector(".mai-api-footer");
    if (existingFooter) existingFooter.remove();

    const apiFooter = document.createElement("div");
    apiFooter.className = "mai-api-footer";
    
    const idLabel = document.createElement("span");
    idLabel.textContent = `Node ID: ${node.id}`;
    
    apiFooter.appendChild(idLabel);
    container.appendChild(apiFooter);

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
    const typeCapitalized = capitalizeFirstLetter(type.toLowerCase());
    const index = nextFieldNameIndex(fields, typeCapitalized);
    const field = {
        id: nextFieldId(fields),
        name: `${typeCapitalized}_${index}`,
        type,
        value: "",
    };

    if (type === "INT") {
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


export function moveField(node, index, direction) {
    const fields = getFieldState(node);
    const newIndex = index + direction;
    if (index < 0 || index >= fields.length || newIndex < 0 || newIndex >= fields.length) return;
    
    const temp = fields[index];
    fields[index] = fields[newIndex];
    fields[newIndex] = temp;
    
    writeFieldsConfig(node, fields);
    normalizeOutputsAfterLoad(node, fields);
    renderDOMFields(node);
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

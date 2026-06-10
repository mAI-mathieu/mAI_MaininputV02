import { app } from "../../../../scripts/app.js";


const EXTENSION_NAME = "mAI.MainInputV02";
const NODE_NAME = "mAI_MainInputV02";
const CONFIG_WIDGET = "fields_config";
const MAX_FIELDS = 24;
const FIELD_TYPES = new Set(["STRING", "DROPDOWN", "IMAGE", "INT", "FLOAT", "BOOLEAN"]);
const OUTPUT_TYPE_BY_FIELD_TYPE = {
    STRING: "STRING",
    DROPDOWN: "STRING",
    IMAGE: "IMAGE",
    INT: "INT",
    FLOAT: "FLOAT",
    BOOLEAN: "BOOLEAN",
};

let nextRuntimeId = 1;


function warn(message, error) {
    if (error) {
        console.warn(`[${EXTENSION_NAME}] ${message}`, error);
        return;
    }

    console.warn(`[${EXTENSION_NAME}] ${message}`);
}


function findFieldsConfigWidget(node) {
    return node.widgets?.find((widget) => widget.name === CONFIG_WIDGET);
}


function hideFieldsConfigWidget(node) {
    const widget = findFieldsConfigWidget(node);
    if (!widget) {
        return;
    }

    widget.hidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];

    if (widget.inputEl?.style) {
        widget.inputEl.style.display = "none";
    }
    if (widget.element?.style) {
        widget.element.style.display = "none";
    }
}


function parseFieldsConfig(text) {
    let parsed;
    try {
        parsed = JSON.parse(text || "[]");
    } catch (error) {
        throw new Error(`fields_config must be valid JSON: ${error.message}`);
    }

    if (!Array.isArray(parsed)) {
        throw new Error("fields_config must be a JSON list");
    }

    if (parsed.length > MAX_FIELDS) {
        throw new Error(`fields_config supports at most ${MAX_FIELDS} fields`);
    }

    return parsed.map((item, index) => validateField(item, index));
}


function validateField(item, index) {
    const label = `fields_config[${index}]`;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`${label} must be an object`);
    }

    if (typeof item.id !== "string" || item.id.trim() === "") {
        throw new Error(`${label}.id must be a non-empty string`);
    }

    if (typeof item.name !== "string" || item.name.trim() === "") {
        throw new Error(`${label}.name must be a non-empty string`);
    }

    if (typeof item.type !== "string") {
        throw new Error(`${label}.type must be a string`);
    }

    const type = item.type.trim().toUpperCase();
    if (!FIELD_TYPES.has(type)) {
        throw new Error(`${label}.type must be one of: ${Array.from(FIELD_TYPES).join(", ")}`);
    }

    const field = {
        id: item.id.trim(),
        name: item.name.trim(),
        type,
    };

    if (type === "DROPDOWN") {
        field.options = normalizeOptions(item.options);
        field.value = normalizeString(item.value ?? field.options[0] ?? "");
        return field;
    }

    field.value = normalizeValue(item.value, type);
    return field;
}


function normalizeOptions(options) {
    const rawOptions = Array.isArray(options) ? options : String(options ?? "").split(",");
    return rawOptions.map((option) => String(option).trim()).filter(Boolean);
}


function normalizeValue(value, type) {
    if (type === "STRING" || type === "IMAGE") {
        return normalizeString(value);
    }
    if (type === "INT") {
        const parsed = Number.parseInt(value ?? 0, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (type === "FLOAT") {
        const parsed = Number.parseFloat(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0.0;
    }
    if (type === "BOOLEAN") {
        return normalizeBoolean(value);
    }

    return value;
}


function normalizeString(value) {
    return String(value ?? "");
}


function normalizeBoolean(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
}


function readFieldsFromConfig(node) {
    const widget = findFieldsConfigWidget(node);
    if (!widget) {
        throw new Error("Could not find fields_config widget");
    }

    return parseFieldsConfig(typeof widget.value === "string" ? widget.value : String(widget.value ?? "[]"));
}


function serializeFields(fields) {
    return fields.map((field) => {
        const item = {
            id: field.id,
            name: field.name,
            type: field.type,
            value: field.value,
        };

        if (field.type === "DROPDOWN") {
            item.options = [...(field.options ?? [])];
        }

        return item;
    });
}


function writeFieldsConfig(node, fields) {
    const widget = findFieldsConfigWidget(node);
    if (!widget) {
        warn("Could not write fields_config because the widget is missing.");
        return;
    }

    node.__mAI_MainInputV02_fields = fields;
    widget.value = JSON.stringify(serializeFields(fields), null, 2);
    app.canvas?.setDirty(true, true);
}


function getFieldState(node) {
    if (!node.__mAI_MainInputV02_fields) {
        try {
            node.__mAI_MainInputV02_fields = readFieldsFromConfig(node);
        } catch (error) {
            warn("Invalid fields_config. Existing UI was left unchanged.", error);
            node.__mAI_MainInputV02_fields = [];
        }
    }

    return node.__mAI_MainInputV02_fields;
}


function ensureControls(node) {
    hideFieldsConfigWidget(node);

    if (node.__mAI_MainInputV02_controlsAdded) {
        return;
    }

    node.__mAI_MainInputV02_controlsAdded = true;
    addButton(node, "+ String", () => addField(node, "STRING"));
    addButton(node, "+ Dropdown", () => addField(node, "DROPDOWN"));
    addButton(node, "+ Image", () => addField(node, "IMAGE"));
    addButton(node, "+ Int", () => addField(node, "INT"));
    addButton(node, "+ Float", () => addField(node, "FLOAT"));
    addButton(node, "+ Boolean", () => addField(node, "BOOLEAN"));
}


function addButton(node, name, callback) {
    const widget = node.addWidget("button", name, null, callback);
    widget.__mAI_MainInputV02_control = true;
    widget.serialize = false;
    return widget;
}


function addField(node, type) {
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
    resizeNode(node);
}


function createDefaultField(type, fields) {
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


function nextFieldNameIndex(fields, prefix) {
    let index = 1;
    const names = new Set(fields.map((field) => field.name));
    while (names.has(`${prefix}_${index}`)) {
        index += 1;
    }
    return index;
}


function nextFieldId(fields) {
    const usedIds = new Set(fields.map((field) => field.id));
    let id = "";
    do {
        id = `field_${Date.now().toString(36)}_${nextRuntimeId++}`;
    } while (usedIds.has(id));
    return id;
}


function addFieldWidgets(node, field) {
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
    } else if (field.type === "IMAGE") {
        widgets.value = node.addWidget("text", `${field.name} image`, field.value, (value) => {
            field.value = normalizeString(value);
            writeFieldsConfig(node, getFieldState(node));
        });
        tagFieldWidget(widgets.value, field.id);
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


function addStringValueWidget(node, name, value, callback) {
    return node.addWidget("text", name, value ?? "", callback);
}


function tagFieldWidget(widget, fieldId) {
    widget.__mAI_MainInputV02_dynamicField = true;
    widget.__mAI_MainInputV02_fieldId = fieldId;
    widget.serialize = false;
    return widget;
}


function normalizeName(value, fallback) {
    const nextName = normalizeString(value).trim();
    return nextName || fallback || "field";
}


function refreshFieldWidgetLabels(node, field) {
    const widgets = node.__mAI_MainInputV02_fieldWidgets?.[field.id];
    if (!widgets) {
        return;
    }

    if (widgets.value) {
        widgets.value.name = field.type === "IMAGE" ? `${field.name} image` : `${field.name} value`;
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


function refreshDropdownWidget(widget, field) {
    if (!widget) {
        return;
    }

    widget.options ??= {};
    widget.options.values = field.options ?? [];
    widget.value = field.value;
}


function removeField(node, fieldId) {
    const fields = getFieldState(node);
    const index = fields.findIndex((field) => field.id === fieldId);
    if (index < 0) {
        return;
    }

    fields.splice(index, 1);
    removeWidgetsForField(node, fieldId);
    removeOutputForField(node, fieldId, index);
    writeFieldsConfig(node, fields);
    resizeNode(node);
}


function removeDynamicFieldWidgets(node) {
    if (!node.widgets) {
        return;
    }

    node.widgets = node.widgets.filter((widget) => !widget.__mAI_MainInputV02_dynamicField);
    node.__mAI_MainInputV02_fieldWidgets = {};
}


function removeWidgetsForField(node, fieldId) {
    if (!node.widgets) {
        return;
    }

    node.widgets = node.widgets.filter((widget) => widget.__mAI_MainInputV02_fieldId !== fieldId);
    delete node.__mAI_MainInputV02_fieldWidgets?.[fieldId];
}


function outputTypeForField(field) {
    return OUTPUT_TYPE_BY_FIELD_TYPE[field.type];
}


function buildOutputDescriptors(fields) {
    return fields.map((field) => ({
        fieldId: field.id,
        name: field.name,
        type: outputTypeForField(field),
    }));
}


function addOutputForField(node, field) {
    node.addOutput(field.name, outputTypeForField(field));
    const output = node.outputs?.[node.outputs.length - 1];
    if (output) {
        output.__mAI_MainInputV02_fieldId = field.id;
    }
    app.canvas?.setDirty(true, true);
}


function removeOutputForField(node, fieldId, fallbackIndex) {
    const outputIndex = findOutputIndex(node, fieldId, fallbackIndex);
    if (outputIndex >= 0) {
        node.removeOutput(outputIndex);
    }
    app.canvas?.setDirty(true, true);
}


function updateOutputName(node, fieldId, name) {
    const outputIndex = findOutputIndex(node, fieldId);
    if (outputIndex < 0) {
        return;
    }

    node.outputs[outputIndex].name = name;
    app.canvas?.setDirty(true, true);
}


function findOutputIndex(node, fieldId, fallbackIndex = -1) {
    const outputs = node.outputs ?? [];
    const outputIndex = outputs.findIndex((output) => output.__mAI_MainInputV02_fieldId === fieldId);
    if (outputIndex >= 0) {
        return outputIndex;
    }

    if (fallbackIndex >= 0 && fallbackIndex < outputs.length) {
        return fallbackIndex;
    }

    return -1;
}


function syncOutputsAfterLoad(node, fields) {
    const expected = buildOutputDescriptors(fields);

    for (let i = 0; i < expected.length; i++) {
        const descriptor = expected[i];

        if (node.outputs?.[i]) {
            node.outputs[i].name = descriptor.name;
            node.outputs[i].type = descriptor.type;
            node.outputs[i].__mAI_MainInputV02_fieldId = descriptor.fieldId;
        } else {
            node.addOutput(descriptor.name, descriptor.type);
            const output = node.outputs?.[node.outputs.length - 1];
            if (output) {
                output.__mAI_MainInputV02_fieldId = descriptor.fieldId;
            }
        }
    }

    app.canvas?.setDirty(true, true);
}


function rebuildFromConfig(node) {
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

    syncOutputsAfterLoad(node, fields);
    resizeNode(node);
}


function scheduleRebuild(node) {
    if (node.__mAI_MainInputV02_rebuildTimer) {
        clearTimeout(node.__mAI_MainInputV02_rebuildTimer);
    }

    node.__mAI_MainInputV02_rebuildTimer = setTimeout(() => {
        node.__mAI_MainInputV02_rebuildTimer = null;
        rebuildFromConfig(node);
    }, 0);
}


function resizeNode(node) {
    const computedSize = node.computeSize?.();
    if (!computedSize) {
        app.canvas?.setDirty(true, true);
        return;
    }

    const currentWidth = Array.isArray(node.size) ? node.size[0] : computedSize[0];
    node.setSize([Math.max(currentWidth, computedSize[0]), computedSize[1]]);
    app.canvas?.setDirty(true, true);
}


app.registerExtension({
    name: EXTENSION_NAME,

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = onNodeCreated?.apply(this, args);
            ensureControls(this);
            hideFieldsConfigWidget(this);
            scheduleRebuild(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const result = onConfigure?.apply(this, args);
            hideFieldsConfigWidget(this);
            scheduleRebuild(this);
            return result;
        };
    },
});

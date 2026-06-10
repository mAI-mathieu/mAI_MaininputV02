import { app } from "../../../../scripts/app.js";
import { CONFIG_WIDGET, EXTENSION_NAME } from "./constants.js";
import { parseFieldsConfig, serializeFields } from "./field_config.js";


export function warn(message, error) {
    if (error) {
        console.warn(`[${EXTENSION_NAME}] ${message}`, error);
        return;
    }

    console.warn(`[${EXTENSION_NAME}] ${message}`);
}


export function markCanvasDirty() {
    app.canvas?.setDirty(true, true);
}


export function graphLinkById(linkId) {
    return app.graph?.links?.[linkId];
}


export function findFieldsConfigWidget(node) {
    return node.widgets?.find((widget) => widget.name === CONFIG_WIDGET);
}


export function findNodeWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}


export function hideFieldsConfigWidget(node) {
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


export function readFieldsFromConfig(node) {
    const widget = findFieldsConfigWidget(node);
    if (!widget) {
        throw new Error("Could not find fields_config widget");
    }

    return parseFieldsConfig(typeof widget.value === "string" ? widget.value : String(widget.value ?? "[]"));
}


export function writeFieldsConfig(node, fields) {
    const widget = findFieldsConfigWidget(node);
    if (!widget) {
        warn("Could not write fields_config because the widget is missing.");
        return;
    }

    node.__mAI_MainInputV02_fields = fields;
    widget.value = JSON.stringify(serializeFields(fields), null, 2);
    markCanvasDirty();
}


export function getFieldState(node) {
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


export function scheduleRebuild(node, rebuildFromConfig) {
    if (node.__mAI_MainInputV02_rebuildTimer) {
        clearTimeout(node.__mAI_MainInputV02_rebuildTimer);
    }

    node.__mAI_MainInputV02_rebuildTimer = setTimeout(() => {
        node.__mAI_MainInputV02_rebuildTimer = null;
        rebuildFromConfig(node);
    }, 0);
}

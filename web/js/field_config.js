import { FIELD_TYPES, MAX_FIELDS, OUTPUT_TYPE_BY_FIELD_TYPE } from "./constants.js";


export function parseFieldsConfig(text) {
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


export function validateField(item, index) {
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


export function serializeFields(fields) {
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


export function normalizeOptions(options) {
    const rawOptions = Array.isArray(options) ? options : String(options ?? "").split(",");
    return rawOptions.map((option) => String(option).trim()).filter(Boolean);
}


export function normalizeValue(value, type) {
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


export function normalizeString(value) {
    return String(value ?? "");
}


export function normalizeBoolean(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
}


export function normalizeName(value, fallback) {
    const nextName = normalizeString(value).trim();
    return nextName || fallback || "field";
}


export function outputTypeForField(field) {
    return OUTPUT_TYPE_BY_FIELD_TYPE[field.type];
}

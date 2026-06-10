import { FIXED_OUTPUT_COUNT, FIXED_OUTPUT_DESCRIPTORS } from "./constants.js";
import { outputTypeForField } from "./field_config.js";
import { graphLinkById, markCanvasDirty } from "./node_state.js";


export function buildOutputDescriptors(fields) {
    const dynamicDescriptors = fields.map((field) => ({
        fieldId: field.id,
        name: field.name,
        type: outputTypeForField(field),
    }));

    return [...FIXED_OUTPUT_DESCRIPTORS, ...dynamicDescriptors];
}


export function addOutputForField(node, field) {
    ensureFixedOutputsForAppend(node);
    node.addOutput(field.name, outputTypeForField(field));
    const output = node.outputs?.[node.outputs.length - 1];
    if (output) {
        output.__mAI_MainInputV02_fieldId = field.id;
    }
    markCanvasDirty();
}


function ensureFixedOutputsForAppend(node) {
    node.outputs ??= [];

    for (let index = 0; index < FIXED_OUTPUT_DESCRIPTORS.length; index++) {
        const descriptor = FIXED_OUTPUT_DESCRIPTORS[index];
        if (node.outputs[index]) {
            node.outputs[index].name = descriptor.name;
            node.outputs[index].type = descriptor.type;
            node.outputs[index].__mAI_MainInputV02_fieldId = descriptor.fieldId;
        } else {
            node.addOutput(descriptor.name, descriptor.type);
            const output = node.outputs?.[node.outputs.length - 1];
            if (output) {
                output.__mAI_MainInputV02_fieldId = descriptor.fieldId;
            }
        }
    }
}


export function removeOutputForField(node, fieldId, fallbackIndex) {
    const outputIndex = findOutputIndex(node, fieldId, FIXED_OUTPUT_COUNT + fallbackIndex);
    if (outputIndex >= 0) {
        node.removeOutput(outputIndex);
    }
    markCanvasDirty();
}


export function updateOutputName(node, fieldId, name) {
    if (isFixedOutputId(fieldId)) {
        return;
    }

    const outputIndex = findOutputIndex(node, fieldId);
    if (outputIndex < 0) {
        return;
    }

    node.outputs[outputIndex].name = name;
    markCanvasDirty();
}


export function findOutputIndex(node, fieldId, fallbackIndex = -1) {
    if (isFixedOutputId(fieldId)) {
        return -1;
    }

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


function isFixedOutputId(fieldId) {
    return FIXED_OUTPUT_DESCRIPTORS.some((descriptor) => descriptor.fieldId === fieldId);
}


export function findBestExistingOutputIndex(outputs, descriptor, expectedIndex, usedOldIndexes) {
    let index = outputs.findIndex((output, i) =>
        !usedOldIndexes.has(i) &&
        output.__mAI_MainInputV02_fieldId === descriptor.fieldId
    );
    if (index >= 0) {
        return index;
    }

    index = outputs.findIndex((output, i) =>
        !usedOldIndexes.has(i) &&
        output.name === descriptor.name &&
        output.type === descriptor.type
    );
    if (index >= 0) {
        return index;
    }

    const fallbackOutput = outputs[expectedIndex];
    if (
        !descriptor.fixed &&
        fallbackOutput &&
        !usedOldIndexes.has(expectedIndex) &&
        Array.isArray(fallbackOutput.links) &&
        fallbackOutput.links.length > 0
    ) {
        return expectedIndex;
    }

    index = outputs.findIndex((output, i) =>
        !usedOldIndexes.has(i) &&
        output.name === descriptor.name
    );
    if (index >= 0) {
        return index;
    }

    return -1;
}


export function normalizeOutputsAfterLoad(node, fields) {
    const expected = buildOutputDescriptors(fields);
    const currentOutputs = node.outputs ?? [];
    const usedOldIndexes = new Set();
    const nextOutputs = [];

    for (let newIndex = 0; newIndex < expected.length; newIndex++) {
        const descriptor = expected[newIndex];
        const oldIndex = findBestExistingOutputIndex(
            currentOutputs,
            descriptor,
            newIndex,
            usedOldIndexes
        );

        let oldOutput = null;
        let links = null;
        if (oldIndex >= 0 && currentOutputs[oldIndex]) {
            oldOutput = currentOutputs[oldIndex];
            links = oldOutput.links ?? null;
            usedOldIndexes.add(oldIndex);
        }

        const output = {
            ...(oldOutput ?? {}),
            name: descriptor.name,
            type: descriptor.type,
            links,
        };

        output.__mAI_MainInputV02_fieldId = descriptor.fieldId;
        nextOutputs.push(output);

        updateLinkOriginSlots(links, newIndex);
    }

    appendUnexpectedLinkedOutputs(currentOutputs, usedOldIndexes, nextOutputs);
    node.outputs = nextOutputs;
    markCanvasDirty();
}


function appendUnexpectedLinkedOutputs(currentOutputs, usedOldIndexes, nextOutputs) {
    for (let oldIndex = 0; oldIndex < currentOutputs.length; oldIndex++) {
        const output = currentOutputs[oldIndex];
        const links = output?.links;
        if (usedOldIndexes.has(oldIndex) || !Array.isArray(links) || links.length === 0) {
            continue;
        }

        const newIndex = nextOutputs.length;
        nextOutputs.push({ ...output, links });
        updateLinkOriginSlots(links, newIndex);
    }
}


function updateLinkOriginSlots(links, outputIndex) {
    if (!Array.isArray(links)) {
        return;
    }

    for (const linkId of links) {
        const link = graphLinkById(linkId);
        if (link) {
            link.origin_slot = outputIndex;
        }
    }
}

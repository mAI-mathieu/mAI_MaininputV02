export const EXTENSION_NAME = "mAI.MainInputV02";
export const NODE_NAME = "mAI_MainInputV02";
export const CONFIG_WIDGET = "fields_config";
export const MAX_FIELDS = 24;
export const FIXED_OUTPUT_COUNT = 5;

export const DEFAULT_SIZE_PRESET = "custom";
export const DEFAULT_WIDTH = 1024;
export const DEFAULT_HEIGHT = 1024;

export const SIZE_PRESETS = {
    custom: null,
    "1:1 square 1024x1024": { width: 1024, height: 1024 },
    "3:4 portrait 896x1152": { width: 896, height: 1152 },
    "5:8 portrait 832x1216": { width: 832, height: 1216 },
    "9:16 portrait 768x1344": { width: 768, height: 1344 },
    "9:21 portrait 640x1536": { width: 640, height: 1536 },
    "4:3 landscape 1152x896": { width: 1152, height: 896 },
    "3:2 landscape 1216x832": { width: 1216, height: 832 },
    "16:9 landscape 1344x768": { width: 1344, height: 768 },
    "21:9 landscape 1536x640": { width: 1536, height: 640 },
};

export const FIELD_TYPES = new Set(["STRING", "DROPDOWN", "INT", "FLOAT", "BOOLEAN"]);

export const OUTPUT_TYPE_BY_FIELD_TYPE = {
    STRING: "STRING",
    DROPDOWN: "STRING",
    INT: "INT",
    FLOAT: "FLOAT",
    BOOLEAN: "BOOLEAN",
};

export const FIXED_OUTPUT_DESCRIPTORS = [
    { fieldId: "__fixed_width", name: "width", type: "INT", fixed: true },
    { fieldId: "__fixed_height", name: "height", type: "INT", fixed: true },
    { fieldId: "__fixed_User_prompt", name: "User_prompt", type: "STRING", fixed: true },
    { fieldId: "__fixed_Main_image", name: "Main_image", type: "IMAGE", fixed: true },
    { fieldId: "__fixed_Main_mask", name: "Main_mask", type: "MASK", fixed: true },
];

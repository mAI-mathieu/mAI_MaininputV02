import { app } from "../../../../scripts/app.js";
import { EXTENSION_NAME, NODE_NAME } from "./constants.js";
import { ensureControls, scheduleRestore } from "./field_widgets.js";
import { hideFieldsConfigWidget } from "./node_state.js";


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
            scheduleRestore(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            this.__mAI_MainInputV02_restoring = true;
            const result = onConfigure?.apply(this, args);
            hideFieldsConfigWidget(this);
            scheduleRestore(this);
            return result;
        };
    },
});

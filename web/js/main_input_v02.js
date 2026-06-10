import { app } from "../../../../scripts/app.js";
import { EXTENSION_NAME, NODE_NAME } from "./constants.js";
import { ensureControls, rebuildFromConfig } from "./field_widgets.js";
import { hideFieldsConfigWidget, scheduleRebuild } from "./node_state.js";


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
            scheduleRebuild(this, rebuildFromConfig);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const result = onConfigure?.apply(this, args);
            hideFieldsConfigWidget(this);
            scheduleRebuild(this, rebuildFromConfig);
            return result;
        };
    },
});

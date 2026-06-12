import { api } from "../../../../scripts/api.js";
import { app } from "../../../../scripts/app.js";

const EXTENSION_NAME = "mAI.ImageLoader";
const NODE_NAME = "mAI_ImageLoader";

function addStylesheet() {
    if (document.getElementById("mai-main-input-css")) return;
    const style = document.createElement("link");
    style.id = "mai-main-input-css";
    style.rel = "stylesheet";
    style.type = "text/css";
    style.href = new URL("../css/main_input.css", import.meta.url).href;
    document.head.appendChild(style);
}

function generateImageLoaderSchema(node) {
    const findWidgetVal = (name) => {
        const w = node.widgets?.find(w => w.name === name);
        return w ? w.value : null;
    };
    
    const apiFormat = {};
    apiFormat[String(node.id)] = {
        inputs: {
            image: findWidgetVal("image") ?? "none",
            Mask_override_image: findWidgetVal("Mask_override_image") ?? "none",
        },
        class_type: node.comfyClass || "mAI_ImageLoader",
        _meta: {
            title: node.title || "mAI ImageLoader"
        }
    };
    return JSON.stringify(apiFormat, null, 2);
}

export function updateNodeUI(node) {
    if (!node.__mAI_ImageLoader_domWidget) return;
    const container = node.__mAI_ImageLoader_domWidget.element;
    if (!container) return;

    const idLabel = container.querySelector(".mai-api-footer span");
    if (idLabel) {
        idLabel.textContent = `Node ID: ${node.id}`;
    }

    const schemaPre = container.querySelector(".mai-api-details pre");
    if (schemaPre) {
        schemaPre.textContent = generateImageLoaderSchema(node);
    }
}

export function resizeNode(node) {
    const computedSize = node.computeSize?.();
    if (!computedSize || !node.size) {
        app.canvas?.setDirty(true, true);
        return;
    }

    // Directly set the height. Do NOT use node.setSize() because LiteGraph 
    // forces the width to expand to the image preview's natural resolution.
    node.size[1] = computedSize[1];
    app.canvas?.setDirty(true, true);
}

export function ensureControls(node) {
    const mainImageWidget = node.widgets?.find((w) => w.name === "image");
    const maskWidget = node.widgets?.find((w) => w.name === "Mask_override_image");
    
    if (mainImageWidget) {
        mainImageWidget.options = mainImageWidget.options || {};
        mainImageWidget.options.image_upload = true;
    }

    if (maskWidget) {
        maskWidget.options = maskWidget.options || {};
        maskWidget.options.image_upload = true;
    }

    if (!mainImageWidget || !maskWidget) {
        app.canvas?.setDirty(true, true);
        return false;
    }

    if (!node.__mAI_ImageLoader_domWidget) {
        addStylesheet();

        const container = document.createElement("div");
        container.className = "mai-dynamic-container";
        
        const stopProp = (e) => e.stopPropagation();
        container.addEventListener("pointerdown", stopProp);
        container.addEventListener("mousedown", stopProp);
        container.addEventListener("dblclick", stopProp);
        container.addEventListener("wheel", stopProp);
        container.addEventListener("keydown", stopProp);

        // Upload Mask Override Button
        const addBar = document.createElement("div");
        addBar.className = "mai-add-bar";

        const maskBtn = document.createElement("button");
        maskBtn.className = "mai-add-button";
        maskBtn.innerText = "📁 Upload Mask Override";
        maskBtn.style.width = "100%"; // Span full width of the bar
        
        maskBtn.addEventListener("click", () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/png,image/jpeg,image/webp";
            input.style.display = "none";
            
            input.onchange = async () => {
                if (!input.files || input.files.length === 0) return;
                
                const body = new FormData();
                body.append("image", input.files[0]);
                body.append("type", "input");
                
                try {
                    const resp = await api.fetchApi("/upload/image", { method: "POST", body });
                    if (resp.status === 200) {
                        const data = await resp.json();
                        if (maskWidget.options && maskWidget.options.values) {
                            if (!maskWidget.options.values.includes(data.name)) {
                                maskWidget.options.values.unshift(data.name);
                            }
                        }
                        maskWidget.value = data.name;
                        updateNodeUI(node);
                        app.canvas?.setDirty(true, true);
                    }
                } catch (err) {
                    console.error("Mask upload failed:", err);
                }
            };
            
            document.body.appendChild(input);
            input.click();
            setTimeout(() => { if (input.parentNode) input.parentNode.removeChild(input); }, 1000);
        });

        addBar.appendChild(maskBtn);
        container.appendChild(addBar);

        // API Footer & Details
        const apiFooter = document.createElement("div");
        apiFooter.className = "mai-api-footer";
        
        const idLabel = document.createElement("span");
        idLabel.textContent = `Node ID: ${node.id}`;
        
        const copyBtn = document.createElement("button");
        copyBtn.textContent = "📋 Copy Schema";
        copyBtn.onclick = () => {
            updateNodeUI(node);
            const schemaStr = generateImageLoaderSchema(node);
            navigator.clipboard.writeText(schemaStr).then(() => {
                copyBtn.textContent = "✅ Copied API Node!";
                copyBtn.style.color = "#80c77d";
                setTimeout(() => {
                    copyBtn.textContent = "📋 Copy Schema";
                    copyBtn.style.color = "";
                }, 2000);
            });
        };
        
        const detailsEl = document.createElement("details");
        detailsEl.className = "mai-api-details";
        if (node.__mAI_api_details_open) detailsEl.open = true;

        const summaryEl = document.createElement("summary");
        summaryEl.textContent = "👁 View Live API Schema";
        
        const preEl = document.createElement("pre");
        preEl.textContent = generateImageLoaderSchema(node);
        
        detailsEl.appendChild(summaryEl);
        detailsEl.appendChild(preEl);
        
        detailsEl.addEventListener("toggle", () => {
            if (node.__mAI_api_details_open === detailsEl.open) return;
            node.__mAI_api_details_open = detailsEl.open;
            
            const EXPANDED_DELTA = 216;
            if (detailsEl.open) {
                node.size[1] += EXPANDED_DELTA;
            } else {
                node.size[1] -= EXPANDED_DELTA;
            }
            
            if (node.__mAI_ImageLoader_domWidget) {
                node.__mAI_ImageLoader_domWidget.computeSize(node.size[0]);
            }
            app.canvas.setDirty(true, true);
        });

        detailsEl.addEventListener("click", () => {
            if (!detailsEl.open) {
                updateNodeUI(node);
            }
        });

        container.appendChild(detailsEl);
        
        apiFooter.appendChild(idLabel);
        apiFooter.appendChild(copyBtn);
        container.appendChild(apiFooter);

        const domWidget = node.addDOMWidget("mai_image_loader_footer", "div", container, { serialize: false, hideOnZoom: false });
        
        domWidget.computeSize = function(width) {
            let contentHeight = 85; // Base padding + Add Bar + Footer
            
            // Add details block height
            const detailsOpen = node.__mAI_api_details_open || false;
            contentHeight += detailsOpen ? 242 : 26; // 242 open, 26 closed
            
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
        node.__mAI_ImageLoader_domWidget = domWidget;

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

        requestAnimationFrame(() => {
            resizeNode(node);
        });
    }

    app.canvas?.setDirty(true, true);
    return true;
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
            updateNodeUI(this);
            return result;
        };

        const onAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function (...args) {
            const result = onAdded?.apply(this, args);
            updateNodeUI(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const result = onConfigure?.apply(this, args);
            ensureControls(this);
            updateNodeUI(this);
            return result;
        };
    },
});

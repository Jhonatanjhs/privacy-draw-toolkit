(function() {
    const leavePageWarning = (e) => {
        if ((window._privacyStrokes && window._privacyStrokes.length > 0) || document.querySelectorAll('.editable-text').length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    };

    const handleWheel = (e) => {
        if (e.target.closest('#privacy-draw-toolbar')) return;
        if (currentTool === 'none' || canvas.classList.contains('interaction-mode')) return;
        e.preventDefault();

        window._isScrolling = true;
        const delta = e.deltaY > 0 ? -2 : 2;
        let currentVal = 0;

        if (currentTool === 'symbol' && pendingSymbol) {
            currentVal = symbolSize = Math.max(10, symbolSize + (delta * 2.5));
        } else if (currentTool === 'pen') {
            currentVal = penSize = Math.max(1, Math.min(50, penSize + delta));
        } else if (currentTool === 'highlighter') {
            currentVal = highlighterSize = Math.max(5, Math.min(100, highlighterSize + delta));
        } else if (currentTool === 'eraser') {
            currentVal = eraserSize = Math.max(5, Math.min(200, eraserSize + delta));
        } else if (currentTool === 'text') {
            currentVal = textSize = Math.max(10, Math.min(100, textSize + delta));
        }

        showToast(`Size: ${Math.round(currentVal)}`);
        brushCursor.style.left = e.clientX + 'px';
        brushCursor.style.top = e.clientY + 'px';
        updateBrushUI();

        clearTimeout(window._scrollEndTimer);
        window._scrollEndTimer = setTimeout(() => {
            window._isScrolling = false;
            savePrefs();
            updateBrushUI();
        }, 150);
    };

    window._privacyCleanup = function() {
        clearTimeout(window._scrollEndTimer);
        clearTimeout(window._toastTimer);
        ['privacy-draw-toolbar','privacy-draw-canvas','privacy-grid-canvas','brush-cursor','laser-cursor','size-toast','privacy-draw-styles'].forEach(id => {
            const el = document.getElementById(id); if(el) el.remove();
        });
        document.querySelectorAll('.editable-text').forEach(t => t.remove());
        window.removeEventListener('wheel', handleWheel);
        window.removeEventListener('beforeunload', leavePageWarning);
        window.onmousedown = null; window.onmousemove = null;
        window.onmouseup = null; window.onkeydown = null; window.onresize = null;
        document.body.style.cursor = '';
		if (typeof canvas !== 'undefined' && canvas) canvas.style.cursor = '';
    };

    const existingToolbar = document.getElementById('privacy-draw-toolbar');
    if (existingToolbar) { window._privacyCleanup(); return; }

    const style = document.createElement('style');
    style.id = 'privacy-draw-styles';
    style.innerHTML = `
        #miniColorPicker { 
            display: none; width: 16px !important; height: 16px !important;
            padding: 0 !important; margin: 0; cursor: pointer; background: none;
            appearance: none; -webkit-appearance: none; box-sizing: border-box;
        }
        #privacy-draw-toolbar.is-minimized #miniColorPicker { display: block; }
        #toolbox-top-bar { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
    `;
    document.head.appendChild(style);

    window.addEventListener('beforeunload', leavePageWarning);

    let currentTool = 'none', lastTool = 'pen', redoStack = [], isDown = false, activeText = null;
    let pendingSymbol = null, symbolSize = 40;
    window._privacyStrokes = [];
    let toolboxOffset = { x: 0, y: 0 }, mouseOffset = { x: 0, y: 0 }, isDraggingToolbox = false;
    let brushColor = "#4a4a4a", highlighterColor = "#ffff00", textColor = "#4a4a4a";
    let penSize = 4, highlighterSize = 25, eraserSize = 30, textSize = 24, gridMode = 'none';
    let useSmoothDrawing = true;

    const savePrefs = () => {
        chrome.storage.sync.set({ brushColor, highlighterColor, textColor, penSize, highlighterSize, eraserSize, textSize });
    };

    const buildPenCursor = () => {
        const svg = [
            `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">`,
            `<polygon points="0,20 3,19 19,4 16,1 1,17"`,
            ` fill="${brushColor}" stroke="white" stroke-width="1" stroke-linejoin="round"/>`,
            `<polygon points="0,20 3,19 1,17"`,
            ` fill="white" opacity="0.25"/>`,
            `</svg>`
        ].join('');
        const encoded = btoa(svg);
        return `url("data:image/svg+xml;base64,${encoded}") 1 19, crosshair`;
    };

    const syncColor = (val) => {
        brushColor = val;
        const mainPicker = document.getElementById('colorPicker');
        const miniPicker = document.getElementById('miniColorPicker');
        if (mainPicker) mainPicker.value = val;
        if (miniPicker) miniPicker.value = val;
        // Rebuild pen cursor with new color if pen is active
        if (currentTool === 'pen') canvas.style.cursor = buildPenCursor();
        savePrefs();
    };

    window.handleClear = function() {
        if (window._privacyStrokes.length === 0 && document.querySelectorAll('.editable-text').length === 0) return;
        redoStack.push([...window._privacyStrokes]);
        window._privacyStrokes = [];
        document.querySelectorAll('.editable-text').forEach(t => t.remove());
        const mainCanvas = document.getElementById('privacy-draw-canvas');
        if (mainCanvas) {
            const ctxClear = mainCanvas.getContext('2d');
            ctxClear.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        }
        if (typeof render === "function") render();
    };

    const captureAndFlatten = (callback) => {
        const tb = document.getElementById('privacy-draw-toolbar');
        if (tb) tb.style.display = 'none';
        requestAnimationFrame(() => {
            setTimeout(() => {
                chrome.runtime.sendMessage({ action: 'captureTab' }, (response) => {
                    if (tb) tb.style.display = '';
                    if (!response || !response.dataUrl) return;
                    const img = new Image();
                    img.onload = () => {
                        const final = document.createElement('canvas');
                        final.width = window.innerWidth; final.height = window.innerHeight;
                        const fCtx = final.getContext('2d');
                        fCtx.drawImage(img, 0, 0, final.width, final.height);
                        fCtx.drawImage(gCanvas, 0, 0);
                        fCtx.drawImage(canvas, 0, 0);
                        document.querySelectorAll('.editable-text').forEach(t => {
                            fCtx.fillStyle = t.style.color;
                            fCtx.font = t.style.fontSize + " sans-serif";
                            fCtx.fillText(t.innerText, parseInt(t.style.left), parseInt(t.style.top) + parseInt(t.style.fontSize) * 0.8);
                        });
                        callback(final);
                    };
                    img.src = response.dataUrl;
                });
            }, 100);
        });
    };

    const canvas = document.createElement('canvas');
    const gCanvas = document.createElement('canvas');
    const brushCursor = document.createElement('div');
    const laserCursor = document.createElement('div');
    const sizeToast = document.createElement('div');

    canvas.id = "privacy-draw-canvas"; gCanvas.id = "privacy-grid-canvas";
    brushCursor.id = "brush-cursor"; laserCursor.id = "laser-cursor"; sizeToast.id = "size-toast";

    [gCanvas, canvas, brushCursor, laserCursor, sizeToast].forEach(el => document.body.appendChild(el));

    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const gCtx = gCanvas.getContext('2d');

    const toolbar = document.createElement('div');
    toolbar.id = "privacy-draw-toolbar";
    toolbar.innerHTML = `
        <div id="toolbox-top-bar">
            <div id="drawStatus" class="status-indicator"></div>
            <div class="drag-handle" id="toolboxDragHandle">⋮⋮⋮</div>
            <input type="color" id="miniColorPicker" class="color-picker-input" value="#4a4a4a">
            <button id="toolboxHideBtn">Hide<span>(Q)</span></button>
        </div>
        <div style="display:flex; gap:2px;">
            <button class="draw-btn" id="whiteboardToggle" style="flex:1;" title="Toggle Whiteboard Background (W)">⬜ White<span>(W)</span></button>
            <button class="draw-btn" id="darkboardToggle" style="flex:1;" title="Toggle Darkboard Background (D)">⬛ Dark<span>(D)</span></button>
        </div>
        <button class="draw-btn" id="gridToggle" title="Cycle through Grid overlays (G)">🏁 Grid: None<span>(G)</span></button>
        <div style="display:flex; gap:4px; padding: 2px 3px; background: #333; border-radius: 3px; justify-content: space-between;">
            <button class="symbol-btn" id="arrowTool" title="Draw Arrow (1)" style="color:#00ff00;">➔</button>
            <button class="symbol-btn" data-sym="✓" id="sym-1" title="Checkmark (2)" style="color:#00ff00;">✓</button>
            <button class="symbol-btn" data-sym="✕" id="sym-2" title="Cross (3)" style="color:#ff4d4d;">✕</button>
            <button class="symbol-btn" data-sym="⚠️" id="sym-3" title="Warning (4)" style="color:#ffcc00;">⚠️</button>
            <button class="symbol-btn" data-sym="❓" id="sym-4" title="Question (5)" style="color:#00a2ff;">❓</button>
        </div>
        <div class="tool-group">
            <div style="display:flex; align-items:center; gap:4px;">
                <button class="symbol-btn" id="laserTool" title="Laser Pointer (L)" style="color:#ff3333;">⬤</button>
                <button class="draw-btn" id="penMode" style="flex:1;" title="Pen Tool (P)">✏️ Pen<span>(P)</span></button>
                <input type="color" id="colorPicker" class="color-picker-input" value="#4a4a4a">
            </div>
        </div>
        <div class="tool-group">
            <div style="display:flex; align-items:center; gap:4px;">
                <button class="draw-btn" id="highlighterMode" style="flex:1;" title="Highlighter Tool (H)">🖍️ Highlighter<span>(H)</span></button>
                <input type="color" id="highlighterColorPicker" class="color-picker-input" value="#ffff00">
            </div>
        </div>
        <button class="draw-btn" id="eraserMode" title="Eraser Tool (E)">🧽 Eraser<span>(E)</span></button>
        <div class="tool-group">
            <div style="display:flex; align-items:center; gap:4px;">
                <button class="draw-btn" id="textMode" style="flex:1;" title="Text Tool (T)">🔤 Text<span>(T)</span></button>
                <input type="color" id="textColorPicker" class="color-picker-input" value="#4a4a4a">
            </div>
        </div>
        <button class="draw-btn" id="moveMode" title="Move text/symbols (M)">🖐️ Move Text<span>(M)</span></button>
        <div style="display:flex; gap:3px;">
            <button class="draw-btn" id="undoBtn" style="flex:1;" title="Undo (Ctrl+Z)">↩️ Undo</button>
            <button class="draw-btn" id="redoBtn" style="flex:1;" title="Redo (Ctrl+Y)">Redo ↪️</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:3px; margin-top:5px;">
            <button class="draw-btn action-btn" id="copyBtn" title="Copy to clipboard (Ctrl+C)">📋 Copy to Clipboard</button>
            <div style="display:flex; gap:3px;">
                <button class="draw-btn action-btn" id="saveBtn" style="flex:1; background:#28a745; border-color:#28a745;" title="Save as PNG (Ctrl+S)">💾</button>
                <button class="draw-btn action-btn" id="clearBtn" style="flex:1; background:#4fc3f7; border-color:#4fc3f7; color:#222;" title="Clear (Ctrl+X)">🧹</button>
                <button class="draw-btn action-btn" id="exitBtn" style="flex:1; background:#dc3545; border-color:#dc3545;" title="Exit">✖</button>
            </div>
        </div>
    `;
    document.body.appendChild(toolbar);

    function hexToRgba(h, a) {
        let r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
        return `rgba(${r},${g},${b},${a})`;
    }

    // Maps mouse event coordinates to exact canvas pixel position,
    // accounting for canvas scale vs CSS display size and browser zoom.
    // DO NOT remove or bypass this — it ensures drawing starts from the
    // exact cursor tip pixel regardless of zoom or display scaling.
    const getCanvasPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const showToast = (text) => {
        sizeToast.innerText = text; sizeToast.style.opacity = "1";
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => sizeToast.style.opacity = "0", 1000);
    };

    const enterBrowsingMode = () => {
        if (currentTool !== 'none') lastTool = currentTool;
        currentTool = 'none';
        canvas.classList.add('interaction-mode');
        canvas.style.cursor = ''; canvas.style.pointerEvents = '';
        laserCursor.style.display = 'none';
        document.body.style.cursor = '';
        document.getElementById('drawStatus').classList.add('paused');
        document.querySelectorAll('.draw-btn, .symbol-btn').forEach(el => el.classList.remove('active'));
        updateBrushUI();
    };

    const setTool = (tool) => {
        if (tool === currentTool) { enterBrowsingMode(); return; }
        if (tool !== 'symbol') pendingSymbol = null;
        lastTool = currentTool !== 'none' ? currentTool : lastTool;
        currentTool = tool;
        canvas.style.pointerEvents = '';

        if (tool === 'laser') {
            canvas.classList.add('interaction-mode');
            laserCursor.style.display = 'block';
            document.body.style.cursor = 'none';
            canvas.style.cursor = 'none';
        } else if (tool === 'pen') {
            canvas.classList.remove('interaction-mode');
            laserCursor.style.display = 'none';
            document.body.style.cursor = 'none';
            canvas.style.cursor = buildPenCursor();
        } else if (tool === 'eraser' || tool === 'highlighter') {
            canvas.classList.remove('interaction-mode');
            laserCursor.style.display = 'none';
            document.body.style.cursor = 'none';
            canvas.style.cursor = 'none';
        } else if (tool === 'text') {
            canvas.classList.remove('interaction-mode');
            laserCursor.style.display = 'none';
            document.body.style.cursor = 'text';
            canvas.style.cursor = 'text';
        } else {
            canvas.classList.remove('interaction-mode');
            laserCursor.style.display = 'none';
            document.body.style.cursor = '';
            canvas.style.cursor = '';
        }

        document.getElementById('drawStatus').classList.remove('paused');
        document.querySelectorAll('.draw-btn, .symbol-btn').forEach(el => el.classList.remove('active'));
        const btn = document.getElementById(tool + 'Mode') || document.getElementById(tool + 'Tool');
        if (btn) btn.classList.add('active');
        updateBrushUI();
    };

    const render = () => {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        gCtx.clearRect(0,0,gCanvas.width,gCanvas.height);
        if (gridMode !== 'none') {
            const isDark = canvas.classList.contains('darkboard-active');
            const baseColor = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)";
            gCtx.strokeStyle = baseColor;
            gCtx.fillStyle = (gridMode === 'dots' && !isDark) ? "rgba(0,0,0,0.4)" : baseColor;
            gCtx.beginPath();
            for (let x = 0; x < gCanvas.width; x += 40) {
                for (let y = 0; y < gCanvas.height; y += 40) {
                    if (gridMode==='dots') gCtx.fillRect(x,y,2,2);
                    else if (gridMode==='lines' && x===0) { gCtx.moveTo(0,y); gCtx.lineTo(gCanvas.width,y); }
                    else if (gridMode==='squares') { gCtx.rect(x,y,40,40); }
                }
            }
            gCtx.stroke();
        }
        window._privacyStrokes.forEach(s => {
            ctx.globalCompositeOperation = s.tool==='eraser' ? 'destination-out' : (s.tool==='highlighter' ? 'multiply' : 'source-over');
            ctx.lineWidth = s.tool==='eraser' ? (s.width*2) : s.width;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.strokeStyle = s.color;
            ctx.beginPath();
            if (s.tool === 'arrow') {
                const headlen = s.width * 4;
                const from = s.points[0], to = s.points[s.points.length-1];
                const angle = Math.atan2(to.y - from.y, to.x - from.x);
                ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
                ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI/6), to.y - headlen * Math.sin(angle - Math.PI/6));
                ctx.moveTo(to.x, to.y);
                ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI/6), to.y - headlen * Math.sin(angle + Math.PI/6));
            } else {
                if (useSmoothDrawing && s.points.length >= 3) {
                    ctx.moveTo(s.points[0].x, s.points[0].y);
                    for (let i = 1; i < s.points.length - 2; i++) {
                        const xc = (s.points[i].x + s.points[i+1].x) / 2;
                        const yc = (s.points[i].y + s.points[i+1].y) / 2;
                        ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, xc, yc);
                    }
                    ctx.quadraticCurveTo(
                        s.points[s.points.length-2].x, s.points[s.points.length-2].y,
                        s.points[s.points.length-1].x, s.points[s.points.length-1].y
                    );
                } else {
                    s.points.forEach((p, i) => { if (i===0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
                }
            }
            ctx.stroke();
        });
    };

    document.getElementById('copyBtn').onclick = () => {
        const btn = document.getElementById('copyBtn');
        const original = btn.innerHTML;
        btn.innerHTML = "⏳ Capturing...";
        captureAndFlatten((final) => {
            final.toBlob(blob => {
                const item = new ClipboardItem({ "image/png": blob });
                navigator.clipboard.write([item]).then(() => {
                    btn.innerHTML = "📋 Copied!";
                    setTimeout(() => btn.innerHTML = original, 1500);
                }).catch(() => {
                    btn.innerHTML = "❌ Failed";
                    setTimeout(() => btn.innerHTML = original, 1500);
                });
            }, "image/png");
        });
    };

    document.getElementById('saveBtn').onclick = () => {
        captureAndFlatten((final) => {
            const link = document.createElement('a');
            link.download = 'drawing.png'; link.href = final.toDataURL("image/png"); link.click();
        });
    };

    document.getElementById('clearBtn').onclick = window.handleClear;
    document.getElementById('exitBtn').onclick = () => window._privacyCleanup();
    window.addEventListener('wheel', handleWheel, { passive: false });

    const updateBrushUI = () => {
        if (currentTool === 'none' || currentTool === 'laser' || currentTool === 'move') {
            brushCursor.style.display = 'none'; return;
        }

        // Reset all styles
        brushCursor.style.display = 'block';
        brushCursor.style.border = "none"; brushCursor.style.outline = "none";
        brushCursor.style.background = "none"; brushCursor.style.padding = "0";
        brushCursor.style.borderRadius = "0"; brushCursor.style.transform = "";
        brushCursor.style.opacity = "1.0"; brushCursor.style.width = 'auto';
        brushCursor.style.height = 'auto'; brushCursor.style.fontSize = '';
        brushCursor.style.color = ''; brushCursor.style.pointerEvents = 'none';
        brushCursor.innerHTML = ""; brushCursor.innerText = "";

        if (currentTool === 'pen') {
            // Only show size dot while scrolling to resize — hide otherwise.
            // The SVG pen cursor (set in setTool) handles the visual at all other times.
            if (window._isScrolling) {
                const dotSize = Math.max(penSize, 3);
                brushCursor.style.width = dotSize + 'px';
                brushCursor.style.height = dotSize + 'px';
                brushCursor.style.borderRadius = '50%';
                brushCursor.style.background = brushColor;
                brushCursor.style.border = '1px solid rgba(255,255,255,0.6)';
                brushCursor.style.outline = '1px solid rgba(0,0,0,0.3)';
                brushCursor.style.transform = 'translate(-50%, -50%)';
            } else {
                brushCursor.style.display = 'none';
            }
            return;
        } else if (currentTool === 'text') {
            brushCursor.innerText = "Aa";
            brushCursor.style.fontSize = textSize + 'px';
            brushCursor.style.color = textColor;
            brushCursor.style.opacity = "0.6";
            brushCursor.style.transform = 'translate(-50%, -50%)';
        } else if (pendingSymbol) {
            let colors = {"✕":"#ff4d4d","⚠️":"#ffcc00","❓":"#00a2ff"};
            brushCursor.innerText = pendingSymbol;
            brushCursor.style.fontSize = symbolSize + 'px';
            brushCursor.style.color = colors[pendingSymbol] || "#00ff00";
            brushCursor.style.opacity = "0.85";
            brushCursor.style.transform = 'translate(-50%, -50%)';
        } else if (currentTool === 'eraser') {
            const visual = eraserSize * 2;
            brushCursor.style.width = visual + 'px';
            brushCursor.style.height = visual + 'px';
            brushCursor.style.borderRadius = '50%';
            brushCursor.style.border = '1px solid rgba(0,0,0,0.5)';
            brushCursor.style.outline = '1px solid rgba(255,255,255,0.5)';
            brushCursor.style.background = 'rgba(255,255,255,0.08)';
            brushCursor.style.transform = 'translate(-50%, -50%)';
        } else if (currentTool === 'highlighter') {
            const visual = highlighterSize;
            brushCursor.style.width = visual + 'px';
            brushCursor.style.height = visual + 'px';
            brushCursor.style.borderRadius = '50%';
            brushCursor.style.border = '1px solid rgba(0,0,0,0.3)';
            brushCursor.style.outline = '1px solid rgba(255,255,255,0.4)';
            brushCursor.style.background = hexToRgba(highlighterColor, 0.25);
            brushCursor.style.transform = 'translate(-50%, -50%)';
        }
    };

    const createStorableText = (x, y, content, color, size) => {
        const t = document.createElement('div');
        t.className = 'editable-text'; t.contentEditable = true;
        t.innerText = content; t.style.left = x + 'px'; t.style.top = y + 'px';
        t.style.color = color; t.style.fontSize = size + 'px';
        t.title = ""; t.ondblclick = () => t.remove();
        t.addEventListener('focus', () => { canvas.style.pointerEvents = 'none'; });
        t.addEventListener('blur', () => {
            setTimeout(() => {
                const anyFocused = document.querySelector('.editable-text:focus');
                if (!anyFocused && currentTool === 'text') canvas.style.pointerEvents = '';
            }, 50);
        });
        document.body.appendChild(t);
        return t;
    };

    window.onmousedown = (e) => {
        if (!window._privacyStrokes) return;
        if (e.target.closest('#privacy-draw-toolbar')) return;
        if (e.target.classList.contains('editable-text') && currentTool !== 'move') return;
        if (currentTool === 'none' || currentTool === 'laser') return;
        if (currentTool === 'text') {
            const t = createStorableText(e.clientX - textSize * 0.3, e.clientY - textSize * 0.5, "", textColor, textSize);
            requestAnimationFrame(() => t.focus());
            return;
        }
        if (pendingSymbol) {
            let colors = { "✕": "#ff4d4d", "⚠️": "#ffcc00", "❓": "#00a2ff" };
            createStorableText(e.clientX - symbolSize * 0.5, e.clientY - symbolSize * 0.5, pendingSymbol, colors[pendingSymbol] || "#00ff00", symbolSize);
            pendingSymbol = null; setTool('move'); return;
        }
        if (currentTool === 'move' && e.target.classList.contains('editable-text')) {
            activeText = e.target;
            mouseOffset.x = e.clientX - activeText.offsetLeft;
            mouseOffset.y = e.clientY - activeText.offsetTop;
            return;
        }
        // Hide pen size dot immediately when drawing starts (pen uses SVG cursor instead)
        if (currentTool === 'pen') {
            window._isScrolling = false;
            brushCursor.style.display = 'none';
        }

        isDown = true; redoStack = [];
        let c = (currentTool === 'arrow') ? "#00ff00" : (currentTool === 'highlighter' ? hexToRgba(highlighterColor, 0.5) : brushColor);
        window._privacyStrokes.push({
            tool: currentTool, color: c,
            width: currentTool === 'eraser' ? eraserSize : (currentTool === 'highlighter' ? highlighterSize : penSize),
            points: [getCanvasPos(e)]
        });
    };

    window.onmousemove = (e) => {
        if (!window._privacyStrokes) return;
        if (currentTool === 'laser') {
            laserCursor.style.left = e.clientX + 'px'; laserCursor.style.top = e.clientY + 'px'; return;
        }
        if (isDraggingToolbox) {
            toolbar.style.left = 'auto';
            let newTop = e.clientY - toolboxOffset.y;
            let newRight = window.innerWidth - e.clientX - (toolbar.offsetWidth - toolboxOffset.x);
            toolbar.style.top = Math.max(0, Math.min(newTop, window.innerHeight - toolbar.offsetHeight)) + 'px';
            toolbar.style.right = Math.max(0, Math.min(newRight, window.innerWidth - toolbar.offsetWidth)) + 'px';
            return;
        }
        brushCursor.style.left = e.clientX + 'px'; brushCursor.style.top = e.clientY + 'px';
        sizeToast.style.left = (e.clientX + 20) + 'px'; sizeToast.style.top = (e.clientY + 20) + 'px';
        if (activeText && currentTool === 'move') {
            activeText.style.left = (e.clientX - mouseOffset.x) + 'px';
            activeText.style.top = (e.clientY - mouseOffset.y) + 'px'; return;
        }
        if (isDown) {
            const pos = getCanvasPos(e);
            if (currentTool === 'arrow') window._privacyStrokes[window._privacyStrokes.length-1].points[1] = pos;
            else window._privacyStrokes[window._privacyStrokes.length-1].points.push(pos);
            render();
        }
    };

    window.onmouseup = () => { isDown=false; isDraggingToolbox=false; activeText = null; };

    window.onkeydown = (e) => {
        const k = e.key.toLowerCase();
        if (k === 'escape') {
            e.preventDefault();
            if (currentTool === 'text') {
                setTool('pen');
            } else if (currentTool === 'none') {
                setTool(lastTool);
            } else {
                enterBrowsingMode();
            }
            return;
        }
        if (currentTool === 'none' && k !== 'q') return;
        if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') return;
        if (k === 'q') document.getElementById('toolboxHideBtn').click();
        if (e.ctrlKey && k === 'c') { e.preventDefault(); document.getElementById('copyBtn').click(); }
        if (e.ctrlKey && k === 's') { e.preventDefault(); document.getElementById('saveBtn').click(); }
        if (['1','2','3','4','5'].includes(k)) { e.preventDefault(); document.querySelectorAll('.symbol-btn, #arrowTool')[parseInt(k)-1].click(); }
        if (k === 'w') document.getElementById('whiteboardToggle').click();
        if (k === 'd') document.getElementById('darkboardToggle').click();
        if (k === 'g') document.getElementById('gridToggle').click();
        if (e.ctrlKey && k === 'x') { e.preventDefault(); window.handleClear(); }
        if (e.ctrlKey && k === 'z') { e.preventDefault(); document.getElementById('undoBtn').click(); }
        if (e.ctrlKey && k === 'y') { e.preventDefault(); document.getElementById('redoBtn').click(); }
        const m = { p: 'pen', h: 'highlighter', e: 'eraser', t: 'text', m: 'move', l: 'laser' };
        if (m[k]) setTool(m[k]);
    };

    document.getElementById('toolboxDragHandle').onmousedown = (e) => {
        isDraggingToolbox = true;
        let rect = toolbar.getBoundingClientRect();
        toolboxOffset.x = e.clientX - rect.left; toolboxOffset.y = e.clientY - rect.top;
        e.preventDefault();
    };

    window.onresize = () => { canvas.width=gCanvas.width=window.innerWidth; canvas.height=gCanvas.height=window.innerHeight; render(); };
    window.onresize();

    chrome.storage.sync.get(['brushColor','highlighterColor','textColor','penSize','highlighterSize','eraserSize','textSize'], (prefs) => {
        if (prefs.brushColor != null) { brushColor = prefs.brushColor; syncColor(brushColor); }
        if (prefs.highlighterColor != null) { highlighterColor = prefs.highlighterColor; document.getElementById('highlighterColorPicker').value = highlighterColor; }
        if (prefs.textColor != null) { textColor = prefs.textColor; document.getElementById('textColorPicker').value = textColor; }
        if (prefs.penSize != null) penSize = prefs.penSize;
        if (prefs.highlighterSize != null) highlighterSize = prefs.highlighterSize;
        if (prefs.eraserSize != null) eraserSize = prefs.eraserSize;
        if (prefs.textSize != null) textSize = prefs.textSize;
        setTool('pen');
    });

    document.getElementById('colorPicker').oninput = (e) => syncColor(e.target.value);
    document.getElementById('miniColorPicker').oninput = (e) => syncColor(e.target.value);
    document.getElementById('highlighterColorPicker').oninput = (e) => { highlighterColor = e.target.value; savePrefs(); };
    document.getElementById('textColorPicker').oninput = (e) => { textColor = e.target.value; savePrefs(); };
    document.getElementById('whiteboardToggle').onclick = () => {
        canvas.classList.remove('darkboard-active'); canvas.classList.toggle('whiteboard-active');
        document.getElementById('colorPicker').value = brushColor;
        document.getElementById('textColorPicker').value = textColor; render();
    };
    document.getElementById('darkboardToggle').onclick = () => { canvas.classList.remove('whiteboard-active'); canvas.classList.toggle('darkboard-active'); };
    document.getElementById('gridToggle').onclick = () => {
        const modes = ['none','dots','lines','squares'];
        gridMode = modes[(modes.indexOf(gridMode)+1) % modes.length];
        document.getElementById('gridToggle').innerHTML = `🏁 Grid: ${gridMode.charAt(0).toUpperCase()+gridMode.slice(1)}<span>(G)</span>`; render();
    };
    document.getElementById('penMode').onclick = () => setTool('pen');
    document.getElementById('highlighterMode').onclick = () => setTool('highlighter');
    document.getElementById('eraserMode').onclick = () => setTool('eraser');
    document.getElementById('textMode').onclick = () => setTool('text');
    document.getElementById('moveMode').onclick = () => setTool('move');
    document.getElementById('arrowTool').onclick = () => setTool('arrow');
    document.getElementById('laserTool').onclick = () => setTool('laser');
    document.querySelectorAll('.symbol-btn[data-sym]').forEach(btn => btn.onclick = () => { pendingSymbol = btn.dataset.sym; setTool('symbol'); });

    document.getElementById('undoBtn').onclick = () => {
        if (redoStack.length > 0 && Array.isArray(redoStack[redoStack.length-1])) {
            window._privacyStrokes = redoStack.pop(); render();
        } else if (window._privacyStrokes.length > 0) {
            redoStack.push(window._privacyStrokes.pop()); render();
        }
    };
    document.getElementById('redoBtn').onclick = () => { if(redoStack.length>0){window._privacyStrokes.push(redoStack.pop()); render();} };
    document.getElementById('toolboxHideBtn').onclick = () => {
        toolbar.classList.toggle('is-minimized');
        document.getElementById('toolboxHideBtn').innerHTML = (toolbar.classList.contains('is-minimized') ? "Show" : "Hide") + "<span>(Q)</span>";
    };
    document.getElementById('clearBtn').onclick = window.handleClear;
})();

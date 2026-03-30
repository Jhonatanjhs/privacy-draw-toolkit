(function() {
    const leavePageWarning = (e) => {
        if ((window._privacyStrokes && window._privacyStrokes.length > 0) || document.querySelectorAll('.editable-text').length > 0) {
            e.preventDefault(); 
            e.returnValue = '';
        }
    };

    window._privacyCleanup = function() {
        ['privacy-draw-toolbar', 'privacy-draw-canvas', 'privacy-grid-canvas', 'brush-cursor', 'size-toast', 'privacy-draw-styles'].forEach(id => {
            const el = document.getElementById(id); if(el) el.remove();
        });
        document.querySelectorAll('.editable-text').forEach(t => t.remove());
        window.removeEventListener('wheel', handleWheel);
        window.removeEventListener('beforeunload', leavePageWarning);
        window.onmousedown = null;
        window.onmousemove = null;
        window.onmouseup = null;
        window.onkeydown = null;
        window.onresize = null;
        delete window._privacyStrokes;
        delete window._privacyCleanup;
    };

    const existingToolbar = document.getElementById('privacy-draw-toolbar');
    if (existingToolbar) { 
        if (confirm("Close the toolkit? Unsaved drawings will be lost.")) {
            window._privacyCleanup(); 
        }
        return;
    }

    const style = document.createElement('style');
    style.id = 'privacy-draw-styles';
    style.innerHTML = `
        #miniColorPicker { 
            display: none; 
            width: 16px !important; 
            height: 16px !important; 
            padding: 0 !important;
            margin: 0;
            cursor: pointer;
            background: none;
            appearance: none;
            -webkit-appearance: none;
            box-sizing: border-box;
        }
        #privacy-draw-toolbar.is-minimized #miniColorPicker { 
            display: block; 
        }
        #toolbox-top-bar { 
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            gap: 5px;
        }
    `;

    window._privacyCleanup = function() {
        ['privacy-draw-toolbar', 'privacy-draw-canvas', 'privacy-grid-canvas', 'brush-cursor', 'size-toast', 'privacy-draw-styles'].forEach(id => {
            const el = document.getElementById(id); if(el) el.remove();
        });
        document.querySelectorAll('.editable-text').forEach(t => t.remove());
        window.removeEventListener('wheel', handleWheel);
        window.removeEventListener('beforeunload', leavePageWarning);
        window.onmousedown = null;
        window.onmousemove = null;
        window.onmouseup = null;
        window.onkeydown = null;
        window.onresize = null;
        delete window._privacyStrokes;
        delete window._privacyCleanup;
    };

    window.addEventListener('beforeunload', leavePageWarning);

    let currentTool = 'pen', isInteracting = false, redoStack = [], isDown = false, activeText = null;
    let pendingSymbol = null, symbolSize = 40; 
    window._privacyStrokes = [];
    let toolboxOffset = { x: 0, y: 0 }, mouseOffset = { x: 0, y: 0 }, isDraggingToolbox = false;
    let brushColor = "#4a4a4a", highlighterColor = "#ffff00", textColor = "#4a4a4a";
    let penSize = 4, highlighterSize = 25, eraserSize = 30, textSize = 24, gridMode = 'none';
    let useSmoothDrawing = true;

    const syncColor = (val) => {
        brushColor = val;
        const mainPicker = document.getElementById('colorPicker');
        const miniPicker = document.getElementById('miniColorPicker');
        if (mainPicker) mainPicker.value = val;
        if (miniPicker) miniPicker.value = val;
    };

    window.handleClear = function() {
        if (confirm("Are you sure you want to clear the entire canvas?")) {
            window._privacyStrokes = [];
            document.querySelectorAll('.editable-text').forEach(t => t.remove());
            const mainCanvas = document.getElementById('privacy-draw-canvas');
            if (mainCanvas) {
                const ctxClear = mainCanvas.getContext('2d');
                ctxClear.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            }
            if (typeof render === "function") render();
        }
    };

    const canvas = document.createElement('canvas');
    const gCanvas = document.createElement('canvas');
    const brushCursor = document.createElement('div');
    const sizeToast = document.createElement('div');
    
    canvas.id = "privacy-draw-canvas"; gCanvas.id = "privacy-grid-canvas"; 
    brushCursor.id = "brush-cursor"; sizeToast.id = "size-toast";
    
    [gCanvas, canvas, brushCursor, sizeToast].forEach(el => document.body.appendChild(el));

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
            <button class="symbol-btn" id="arrowTool" title="Draw Arrow (1) - Click & Drag" style="color:#00ff00;">➔</button>
            <button class="symbol-btn" data-sym="✓" id="sym-1" title="Checkmark (2) - Double click to delete" style="color:#00ff00;">✓</button>
            <button class="symbol-btn" data-sym="✕" id="sym-2" title="Cross (3) - Double click to delete" style="color:#ff4d4d;">✕</button>
            <button class="symbol-btn" data-sym="⚠️" id="sym-3" title="Warning (4) - Double click to delete" style="color:#ffcc00;">⚠️</button>
            <button class="symbol-btn" data-sym="❓" id="sym-4" title="Question (5) - Double click to delete" style="color:#00a2ff;">❓</button>
        </div>
        <div class="tool-group">
            <div style="display:flex; align-items:center; gap:4px;">
                <button class="draw-btn active" id="penMode" style="flex:1;" title="Pen Tool (P)">✏️ Pen<span>(P)</span></button>
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
                <button class="draw-btn" id="textMode" style="flex:1;" title="Text Tool (T) - Mouse scroll for text size, then click to type">🔤 Text<span>(T)</span></button>
                <input type="color" id="textColorPicker" class="color-picker-input" value="#4a4a4a">
            </div>
        </div>
        <button class="draw-btn" id="moveMode" title="Click the text or symbol to drag (M)">🖐️ Move Text<span>(M)</span></button>
        <div style="display:flex; gap:3px;">
            <button class="draw-btn" id="undoBtn" style="flex:1;" title="Undo (Ctrl+Z)">↩️ Undo</button>
            <button class="draw-btn" id="redoBtn" style="flex:1;" title="Redo (Ctrl+Y)">Redo ↪️</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:3px; margin-top:5px;">
            <button class="draw-btn action-btn" id="copyBtn" title="Copy PNG drawings to clipboard (Ctrl+C)">📋 Copy to Clipboard</button>
            <div style="display:flex; gap:3px;">
                <button class="draw-btn action-btn" id="saveBtn" style="flex:1;" title="Download drawing as PNG file (Ctrl+S)">💾 Save</button>
                <button class="draw-btn action-btn" id="clearBtn" style="flex:1;" title="Clear Canvas (Ctrl+X)">🗑️ Clear<span></span></button>
            </div>
            <button class="draw-btn action-btn" id="clearExitBtn" style="background:#dc3545;" title="Clear canvas and close the application">🗑️ Clear & Exit</button>
            <button class="draw-btn action-btn" id="saveExitBtn" style="background:#28a745;" title="Download PNG and close the application">💾 Save & Exit</button>
        </div>
    `;
    document.body.appendChild(toolbar);

    function hexToRgba(h,a){ 
        let r=parseInt(h.slice(1,3),16), g=parseInt(h.slice(3,5),16), b=parseInt(h.slice(5,7),16); 
        return `rgba(${r},${g},${b},${a})`; 
    }

    const showToast = (text) => {
        sizeToast.innerText = text; sizeToast.style.opacity = "1";
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => sizeToast.style.opacity = "0", 1000);
    };

    const setTool = (tool) => { 
        isInteracting = false; currentTool = tool; 
        if (tool !== 'symbol') pendingSymbol = null;
        canvas.classList.remove('interaction-mode'); 
        document.getElementById('drawStatus').classList.remove('paused');
        document.querySelectorAll('.draw-btn, .symbol-btn').forEach(el => el.classList.remove('active'));
        const btn = document.getElementById(tool + 'Mode') || document.getElementById(tool + 'Tool');
        if(btn) btn.classList.add('active');
        updateBrushUI(); 
    };

    const render = () => { 
        ctx.clearRect(0,0,canvas.width,canvas.height); gCtx.clearRect(0,0,gCanvas.width,gCanvas.height); 
        if (gridMode !== 'none') {
            const isDark = canvas.classList.contains('darkboard-active');
            const baseColor = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)";
            gCtx.strokeStyle = baseColor; gCtx.fillStyle = (gridMode === 'dots' && !isDark) ? "rgba(0,0,0,0.4)" : baseColor;
            gCtx.beginPath();
            for(let x=0; x<gCanvas.width; x+=40) {
                for(let y=0; y<gCanvas.height; y+=40) {
                    if(gridMode==='dots') gCtx.fillRect(x,y,2,2);
                    else if(gridMode==='lines' && x===0) { gCtx.moveTo(0,y); gCtx.lineTo(gCanvas.width,y); }
                    else if(gridMode==='squares') { gCtx.rect(x,y,40,40); }
                }
            }
            gCtx.stroke();
        }
        window._privacyStrokes.forEach(s => { 
            ctx.globalCompositeOperation = s.tool==='eraser'?'destination-out':(s.tool==='highlighter'?'multiply':'source-over');
            ctx.lineWidth = s.tool==='eraser'?(s.width*2):s.width; 
            ctx.lineCap = 'round'; 
            ctx.lineJoin = 'round';
            ctx.strokeStyle = s.color;
            ctx.beginPath();
            if(s.tool === 'arrow') {
                const headlen = s.width * 4; const from = s.points[0], to = s.points[s.points.length-1];
                const angle = Math.atan2(to.y - from.y, to.x - from.x);
                ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
                ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(to.x, to.y);
                ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
            } else {
                if (useSmoothDrawing && s.points.length >= 3) {
                    ctx.moveTo(s.points[0].x, s.points[0].y);
                    for (let i = 1; i < s.points.length - 2; i++) {
                        const xc = (s.points[i].x + s.points[i + 1].x) / 2;
                        const yc = (s.points[i].y + s.points[i + 1].y) / 2;
                        ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, xc, yc);
                    }
                    ctx.quadraticCurveTo(
                        s.points[s.points.length - 2].x, 
                        s.points[s.points.length - 2].y, 
                        s.points[s.points.length - 1].x, 
                        s.points[s.points.length - 1].y
                    );
                } else {
                    s.points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
                }
            }
            ctx.stroke();
        });
    };

    const getFinalCanvas = () => {
        const final = document.createElement('canvas');
        final.width = canvas.width; final.height = canvas.height;
        const fCtx = final.getContext('2d');
        if(canvas.classList.contains('whiteboard-active')){ fCtx.fillStyle="#ffffff"; fCtx.fillRect(0,0,final.width,final.height); }
        else if(canvas.classList.contains('darkboard-active')){ fCtx.fillStyle="#1e1e1e"; fCtx.fillRect(0,0,final.width,final.height); }
        fCtx.drawImage(gCanvas, 0, 0); fCtx.drawImage(canvas, 0, 0);
        document.querySelectorAll('.editable-text').forEach(t => {
            fCtx.fillStyle = t.style.color; fCtx.font = t.style.fontSize + " sans-serif";
            fCtx.fillText(t.innerText, parseInt(t.style.left), parseInt(t.style.top) + parseInt(t.style.fontSize)*0.8);
        });
        return final;
    };

    const handleSave = () => {
        const link = document.createElement('a'); link.download = 'drawing.png';
        link.href = getFinalCanvas().toDataURL("image/png"); link.click();
    };

    document.getElementById('copyBtn').onclick = () => {
        const btn = document.getElementById('copyBtn');
        const finalCanvas = getFinalCanvas();
        finalCanvas.toBlob(blob => {
            const item = new ClipboardItem({ "image/png": blob });
            navigator.clipboard.write([item]).then(() => {
                const originalText = btn.innerHTML;
                btn.innerHTML = "📋 Image Copied!";
                setTimeout(() => btn.innerHTML = originalText, 1500);
            }).catch(err => {
                console.error("Copy failed: ", err);
                btn.innerHTML = "❌ Copy Failed";
            });
        }, "image/png");
    };

    document.getElementById('saveBtn').onclick = handleSave;

    document.getElementById('clearExitBtn').onclick = () => { 
        if (confirm("This will delete all drawings and close the toolkit. Proceed?")) {
            handleClear(); 
            window._privacyCleanup(); 
        }
    };

    document.getElementById('saveExitBtn').onclick = () => { 
        if (confirm("Save drawing and close the toolkit?")) {
            handleSave(); 
            window._privacyCleanup(); 
        }
    };

    const handleWheel = (e) => {
        if (e.target.closest('#privacy-draw-toolbar')) return;
        if (isInteracting || canvas.classList.contains('interaction-mode')) return;
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
            if (!canvas.classList.contains('interaction-mode')) {
                isInteracting = false; 
            }
            updateBrushUI();
        }, 150);
    };
    window.addEventListener('wheel', handleWheel, { passive: false });

    const updateBrushUI = () => { 
        if (isInteracting && !window._isScrolling && currentTool !== 'text') {
            brushCursor.style.display = 'none';
            return;
        }
        if (currentTool === 'move') {
            brushCursor.style.display = 'none';
            return;
        }
        brushCursor.style.display = 'block'; 
        brushCursor.style.border = "none"; 
        brushCursor.style.background = "none";
        brushCursor.innerText = ""; 
        brushCursor.style.opacity = "1.0";
        if (currentTool === 'text') {
            brushCursor.innerText = "Aa"; brushCursor.style.fontSize = textSize + 'px';
            brushCursor.style.color = textColor; brushCursor.style.opacity = "0.5";
            brushCursor.style.border = "1px dashed #888"; brushCursor.style.width = 'auto'; brushCursor.style.height = 'auto';
        } else if(pendingSymbol) {
            let colors = {"✕":"#ff4d4d","⚠️":"#ffcc00","❓":"#00a2ff"};
            brushCursor.innerText = pendingSymbol; brushCursor.style.fontSize = symbolSize + 'px';
            brushCursor.style.color = colors[pendingSymbol] || "#00ff00";
            brushCursor.style.width = 'auto'; brushCursor.style.height = 'auto';
        } else {
            brushCursor.style.border = "1px solid rgba(0,0,0,0.3)"; brushCursor.style.background = "rgba(255,255,255,0.1)";
            let size=(currentTool==='eraser')?eraserSize:(currentTool==='highlighter'?highlighterSize:penSize); 
            let visual=currentTool==='eraser'?(size*2):size; 
            brushCursor.style.width=visual+'px'; brushCursor.style.height=visual+'px'; 
        }
    };

    const createStorableText = (x, y, content, color, size) => {
        const t = document.createElement('div'); t.className = 'editable-text'; t.contentEditable = true;
        t.innerText = content; t.style.left = x + 'px'; t.style.top = y + 'px';
        t.style.color = color; t.style.fontSize = size + 'px';
        t.title = "";
        t.ondblclick = () => t.remove(); document.body.appendChild(t); return t;
    };

    window.onmousedown = (e) => {
        if (!window._privacyStrokes) return;
        if (e.target.closest('#privacy-draw-toolbar')) return;
        if (currentTool === 'text') {
            createStorableText(e.clientX, e.clientY, "", textColor, textSize).focus();
            isInteracting = false;
            return;
        }
        if (isInteracting) return;
        if (pendingSymbol) {
            let colors = { "✕": "#ff4d4d", "⚠️": "#ffcc00", "❓": "#00a2ff" };
            createStorableText(e.clientX, e.clientY, pendingSymbol, colors[pendingSymbol] || "#00ff00", symbolSize);
            pendingSymbol = null; setTool('move'); return;
        }
        if (currentTool === 'move' && e.target.classList.contains('editable-text')) {
            activeText = e.target; 
            mouseOffset.x = e.clientX - activeText.offsetLeft; 
            mouseOffset.y = e.clientY - activeText.offsetTop; 
            return;
        }
        isDown = true; redoStack = [];
        let c = (currentTool === 'arrow') ? "#00ff00" : (currentTool === 'highlighter' ? hexToRgba(highlighterColor, 0.5) : brushColor);
        window._privacyStrokes.push({
            tool: currentTool, 
            color: c, 
            width: currentTool === 'eraser' ? eraserSize : (currentTool === 'highlighter' ? highlighterSize : penSize), 
            points: [{ x: e.clientX, y: e.clientY }]
        });
    };

    window.onmousemove = (e) => { 
        if (!window._privacyStrokes) return;
        if(isDraggingToolbox){ 
            toolbar.style.left = 'auto';
            let newTop = e.clientY - toolboxOffset.y;
            let newRight = window.innerWidth - e.clientX - (toolbar.offsetWidth - toolboxOffset.x);
            let maxTop = window.innerHeight - toolbar.offsetHeight;
            toolbar.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px'; 
            let maxRight = window.innerWidth - toolbar.offsetWidth;
            toolbar.style.right = Math.max(0, Math.min(newRight, maxRight)) + 'px'; 
            return; 
        } 
        brushCursor.style.left=e.clientX+'px'; brushCursor.style.top=e.clientY+'px'; 
        sizeToast.style.left = (e.clientX + 20) + 'px'; sizeToast.style.top = (e.clientY + 20) + 'px';
        if(activeText && currentTool === 'move') { activeText.style.left = (e.clientX - mouseOffset.x) + 'px'; activeText.style.top = (e.clientY - mouseOffset.y) + 'px'; return; }
        if(isDown){ 
            if(currentTool === 'arrow') window._privacyStrokes[window._privacyStrokes.length-1].points[1] = {x:e.clientX, y:e.clientY};
            else window._privacyStrokes[window._privacyStrokes.length-1].points.push({x:e.clientX,y:e.clientY}); 
            render(); 
        } 
    };

    window.onmouseup = () => { isDown=false; isDraggingToolbox=false; activeText = null; };

    window.onkeydown = (e) => {
        const k = e.key.toLowerCase();
        if (k === 'escape') {
            e.preventDefault();
            if (isInteracting) {
                isInteracting = false;
                setTool('pen');
            } else if (currentTool !== 'pen') {
                setTool('pen');
            } else {
                isInteracting = true;
            }
            canvas.classList.toggle('interaction-mode', isInteracting);
            document.getElementById('drawStatus').classList.toggle('paused', isInteracting);
            updateBrushUI();
            return;
        }
        if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') return;
        if (k === 'q') document.getElementById('toolboxHideBtn').click();
        if (e.ctrlKey && k === 'c') { e.preventDefault(); document.getElementById('copyBtn').click(); }
        if (e.ctrlKey && k === 's') { e.preventDefault(); document.getElementById('saveBtn').click(); }
        if (['1', '2', '3', '4', '5'].includes(k)) { 
            e.preventDefault(); 
            document.querySelectorAll('.symbol-btn, #arrowTool')[parseInt(k) - 1].click(); 
        }
        if (k === 'w') document.getElementById('whiteboardToggle').click(); 
        if (k === 'd') document.getElementById('darkboardToggle').click(); 
        if (k === 'g') document.getElementById('gridToggle').click();
        if (e.ctrlKey && k === 'x') { e.preventDefault(); document.getElementById('clearBtn').click(); }
        if (e.ctrlKey && k === 'z') { e.preventDefault(); document.getElementById('undoBtn').click(); }
        if (e.ctrlKey && k === 'y') { e.preventDefault(); document.getElementById('redoBtn').click(); }
        const m = { p: 'pen', h: 'highlighter', e: 'eraser', t: 'text', m: 'move' }; 
        if (m[k]) setTool(m[k]); 
    };

    document.getElementById('toolboxDragHandle').onmousedown = (e) => { 
        isDraggingToolbox=true; let rect=toolbar.getBoundingClientRect(); 
        toolboxOffset.x=e.clientX-rect.left; toolboxOffset.y=e.clientY-rect.top; 
        e.preventDefault(); 
    };

    window.onresize = () => { canvas.width=gCanvas.width=window.innerWidth; canvas.height=gCanvas.height=window.innerHeight; render(); }; 
    window.onresize();
    
    document.getElementById('colorPicker').oninput = (e) => syncColor(e.target.value);
    document.getElementById('miniColorPicker').oninput = (e) => syncColor(e.target.value);
    document.getElementById('highlighterColorPicker').oninput = (e) => highlighterColor = e.target.value;
    document.getElementById('textColorPicker').oninput = (e) => textColor = e.target.value;
    document.getElementById('whiteboardToggle').onclick = () => { 
        canvas.classList.remove('darkboard-active'); canvas.classList.toggle('whiteboard-active'); 
        document.getElementById('colorPicker').value = brushColor; document.getElementById('textColorPicker').value = textColor; render();
    };
    document.getElementById('darkboardToggle').onclick = () => { 
        canvas.classList.remove('whiteboard-active'); 
        canvas.classList.toggle('darkboard-active');
    };
    document.getElementById('gridToggle').onclick = () => { 
        const modes=['none','dots','lines','squares']; 
        gridMode=modes[(modes.indexOf(gridMode)+1)%modes.length]; 
        document.getElementById('gridToggle').innerHTML=`🏁 Grid: ${gridMode.charAt(0).toUpperCase() + gridMode.slice(1)}<span>(G)</span>`; render(); 
    };
    document.getElementById('penMode').onclick = () => setTool('pen'); 
    document.getElementById('highlighterMode').onclick = () => setTool('highlighter');
    document.getElementById('eraserMode').onclick = () => setTool('eraser'); 
    document.getElementById('textMode').onclick = () => setTool('text');
    document.getElementById('moveMode').onclick = () => setTool('move'); 
    document.getElementById('arrowTool').onclick = () => setTool('arrow');
    document.querySelectorAll('.symbol-btn[data-sym]').forEach(btn => btn.onclick = () => { pendingSymbol = btn.dataset.sym; setTool('symbol'); });
    document.getElementById('undoBtn').onclick = () => { if(window._privacyStrokes.length>0){redoStack.push(window._privacyStrokes.pop()); render();} };
    document.getElementById('redoBtn').onclick = () => { if(redoStack.length>0){window._privacyStrokes.push(redoStack.pop()); render();} };
    document.getElementById('toolboxHideBtn').onclick = () => { 
        toolbar.classList.toggle('is-minimized'); 
        document.getElementById('toolboxHideBtn').innerHTML = (toolbar.classList.contains('is-minimized') ? "Show" : "Hide") + "<span>(Q)</span>";
    };
    document.getElementById('clearBtn').onclick = window.handleClear;
})();

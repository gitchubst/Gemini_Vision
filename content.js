(function() {
    const GEMINI_API_KEY = "PUT_YOUR_KEY";
    const VERSION = "gemini-2.0-flash";

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${VERSION}:generateContent?key=${GEMINI_API_KEY}`;

    try {
        if (window.geminiExtensionGlobalDragMouseMove) {
            document.removeEventListener('mousemove', window.geminiExtensionGlobalDragMouseMove);
            window.geminiExtensionGlobalDragMouseMove = null;
        }
        if (window.geminiExtensionGlobalDragMouseUp) {
            document.removeEventListener('mouseup', window.geminiExtensionGlobalDragMouseUp);
            window.geminiExtensionGlobalDragMouseUp = null;
        }

        const idsToRemove = ['gemini-screenshot-overlay', 'gemini-selection-rectangle', 'gemini-popup', 'gemini-temp-error', 'gemini-uncaught-error-fallback'];
        idsToRemove.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.remove();
            }
        });

        if (document.body.classList.contains('gemini-extension-active')) {
            document.body.classList.remove('gemini-extension-active');
        }

        let overlay, selectionRectDiv, startX, startY, isSelecting = false;
        let capturedImageData = null;
        let popup, queryInput, responseArea, sendButton;
        let initialPopupWidth, initialPopupHeight, initialMouseX, initialMouseY;
        let resizeMouseMoveHandler, resizeMouseUpHandler;

        function initSelection() {
            document.body.classList.add('gemini-extension-active');
            overlay = document.createElement('div');
            overlay.id = 'gemini-screenshot-overlay';
            document.body.appendChild(overlay);
            selectionRectDiv = document.createElement('div');
            selectionRectDiv.id = 'gemini-selection-rectangle';
            overlay.appendChild(selectionRectDiv);
            overlay.addEventListener('mousedown', handleMouseDown);
            overlay.addEventListener('mousemove', handleMouseMove);
            overlay.addEventListener('mouseup', handleMouseUp);
            overlay.addEventListener('mouseleave', cancelSelection);
        }

        function handleMouseDown(e) {
            if (e.button !== 0) return;
            startX = e.clientX;
            startY = e.clientY;
            selectionRectDiv.style.left = startX + 'px';
            selectionRectDiv.style.top = startY + 'px';
            selectionRectDiv.style.width = '0px';
            selectionRectDiv.style.height = '0px';
            selectionRectDiv.style.display = 'block';
            isSelecting = true;
            e.preventDefault();
        }

        function handleMouseMove(e) {
            if (!isSelecting) return;
            const currentX = e.clientX;
            const currentY = e.clientY;
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            const newX = Math.min(startX, currentX);
            const newY = Math.min(startY, currentY);
            selectionRectDiv.style.left = newX + 'px';
            selectionRectDiv.style.top = newY + 'px';
            selectionRectDiv.style.width = width + 'px';
            selectionRectDiv.style.height = height + 'px';
            e.preventDefault();
        }

        async function handleMouseUp(e) {
            if (!isSelecting) return;
            isSelecting = false;
            const rect = {
                x: parseInt(selectionRectDiv.style.left),
                y: parseInt(selectionRectDiv.style.top),
                width: parseInt(selectionRectDiv.style.width),
                height: parseInt(selectionRectDiv.style.height)
            };
            if (overlay) overlay.style.display = 'none';
            if (rect.width <= 5 || rect.height <= 5) {
                alertUser("Selection too small. Please try again.");
                cleanupSelection();
                return;
            }
            try {
                const dataUrl = await chrome.runtime.sendMessage({
                    action: "captureVisibleTab",
                    options: { format: "jpeg", quality: 90 }
                });
                if (dataUrl && typeof dataUrl === 'object' && dataUrl.error) {
                    alertUser(`Failed to capture screen: ${dataUrl.error}`);
                    cleanupSelection();
                } else if (dataUrl && typeof dataUrl === 'string') {
                    cropImage(dataUrl, rect.x, rect.y, rect.width, rect.height, (croppedDataUrl) => {
                        if (croppedDataUrl) {
                            capturedImageData = croppedDataUrl.split(',')[1];
                            showPopup();
                        } else {
                            alertUser("Failed to crop image.");
                        }
                        cleanupSelection();
                    });
                } else {
                    alertUser("Failed to capture screen. Please try again.");
                    cleanupSelection();
                }
            } catch (error) {
                alertUser(`Capture failed: ${error.message}. Ensure extension is loaded & try reloading page.`);
                cleanupSelection();
            }
        }

        function cropImage(dataUrl, cropX, cropY, cropWidth, cropHeight, callback) {
            const img = new Image();
            img.onload = () => {
                const dpr = window.devicePixelRatio || 1;
                const canvas = document.createElement('canvas');
                canvas.width = cropWidth * dpr;
                canvas.height = cropHeight * dpr;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, cropX * dpr, cropY * dpr, cropWidth * dpr, cropHeight * dpr, 0, 0, cropWidth * dpr, cropHeight * dpr);
                callback(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = () => {
                alertUser("Failed to process image. Page content might be restricted or image failed to load.");
                callback(null);
            }
            img.src = dataUrl;
        }

        function cleanupSelection() {
            document.body.classList.remove('gemini-extension-active');
            if (overlay) {
                overlay.removeEventListener('mousedown', handleMouseDown);
                overlay.removeEventListener('mousemove', handleMouseMove);
                overlay.removeEventListener('mouseup', handleMouseUp);
                overlay.removeEventListener('mouseleave', cancelSelection);
                overlay.remove();
                overlay = null;
            }
            if (selectionRectDiv) {
                selectionRectDiv.remove();
                selectionRectDiv = null;
            }
        }

        function cancelSelection() {
            if (isSelecting) {
                isSelecting = false;
            }
            cleanupSelection();
        }

        function showPopup() {
            const existingPopup = document.getElementById('gemini-popup');
            if (existingPopup) {
                existingPopup.remove();
            }
            popup = document.createElement('div');
            popup.id = 'gemini-popup';
            const header = document.createElement('div');
            header.id = 'gemini-popup-header';
            const title = document.createElement('span');
            title.textContent = 'Gemini Vision';
            const closeButton = document.createElement('button');
            closeButton.id = 'gemini-popup-close';
            closeButton.innerHTML = '&times;';
            closeButton.onclick = closePopup;
            header.appendChild(title);
            header.appendChild(closeButton);
            const content = document.createElement('div');
            content.id = 'gemini-popup-content';
            queryInput = document.createElement('input');
            queryInput.id = 'gemini-popup-query-input';
            queryInput.type = 'text';
            queryInput.placeholder = 'Type something and press enter';
            queryInput.autocomplete = 'off';
            queryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleSendQuery();
            });
            const presetsDiv = document.createElement('div');
            presetsDiv.id = 'gemini-popup-presets';
            const presets = [
                { text: "Summarize", query: "Summarize this image." },
                { text: "Explain", query: "Explain this screenshot in detail." },
                { text: "Answer", query: "What is shown in this image? Be specific." }
            ];
            presets.forEach(preset => {
                const button = document.createElement('button');
                button.textContent = preset.text;
                button.onclick = () => {
                    queryInput.value = preset.query;
                };
                presetsDiv.appendChild(button);
            });
            sendButton = document.createElement('button');
            sendButton.id = 'gemini-popup-send';
            sendButton.textContent = 'Send to Gemini';
            sendButton.onclick = handleSendQuery;
            responseArea = document.createElement('div');
            responseArea.id = 'gemini-popup-response-area';
            responseArea.textContent = 'Put in a query';
            content.appendChild(queryInput);
            content.appendChild(presetsDiv);
            content.appendChild(sendButton);
            content.appendChild(responseArea);
            popup.appendChild(header);
            popup.appendChild(content);

            const resizeHandle = document.createElement('div');
            resizeHandle.id = 'gemini-popup-resize-handle';
            popup.appendChild(resizeHandle);
            resizeHandle.addEventListener('mousedown', initResize);

            document.body.appendChild(popup);
            makeDraggable(popup, header);
            queryInput.focus();
        }

        function closePopup() {
            if (popup) {
                popup.remove();
                popup = null;
            }
            capturedImageData = null;
        }

        async function handleSendQuery() {
            if (!capturedImageData) {
                alertUser('Error: No image captured or image data is missing.');
                return;
            }
            if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY" || !GEMINI_API_KEY) {
                alertUser('Error: Gemini API Key is not set. Please configure it in content.js.');
                if(responseArea) {
                    responseArea.textContent = 'Error: Gemini API Key is not set in the extension. Please contact the developer or check the extension files if you are the developer.';
                    responseArea.classList.add('error');
                }
                return;
            }
            const queryText = queryInput.value.trim();
            sendButton.textContent = 'Sending...';
            sendButton.disabled = true;
            sendButton.classList.add('loading');
            responseArea.textContent = 'Processing your request...';
            responseArea.classList.remove('error');
            const requestBody = {
                contents: [{
                    parts: [
                        { inline_data: { mime_type: "image/jpeg", data: capturedImageData } }
                    ]
                }]
            };
            if (queryText) {
                requestBody.contents[0].parts.unshift({ text: queryText });
            } else {
                requestBody.contents[0].parts.unshift({ text: "Describe this image." });
            }
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: { message: "Unknown API error structure" } }));
                    throw new Error(`API Error: ${response.status} ${response.statusText}. ${errorData?.error?.message || 'No specific message.'}`);
                }
                const data = await response.json();
                if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                    responseArea.textContent = data.candidates[0].content.parts[0].text;
                } else if (data.promptFeedback?.blockReason) {
                    const blockMessage = `Blocked: ${data.promptFeedback.blockReason}. ${data.promptFeedback.blockReasonMessage || 'No additional details.'}`;
                    responseArea.textContent = blockMessage;
                    responseArea.classList.add('error');
                } else {
                    responseArea.textContent = 'Received an empty or unexpected response from Gemini.';
                }
            } catch (error) {
                responseArea.textContent = `Error: ${error.message}`;
                responseArea.classList.add('error');
            } finally {
                sendButton.textContent = 'Send to Gemini';
                sendButton.disabled = false;
                sendButton.classList.remove('loading');
            }
        }

        function makeDraggable(element, handle) {
            let dragMouseMoveHandler, dragMouseUpHandler;
            handle.onmousedown = function(event) {
                if (event.button !== 0) return;
                event.preventDefault();
                let shiftX = event.clientX - element.getBoundingClientRect().left;
                let shiftY = event.clientY - element.getBoundingClientRect().top;
                element.style.position = 'fixed';
                function moveAt(mouseClientX, mouseClientY) {
                    let newX = mouseClientX - shiftX;
                    let newY = mouseClientY - shiftY;
                    const maxX = window.innerWidth - element.offsetWidth;
                    const maxY = window.innerHeight - element.offsetHeight;
                    newX = Math.max(0, Math.min(newX, maxX));
                    newY = Math.max(0, Math.min(newY, maxY));
                    element.style.left = newX + 'px';
                    element.style.top = newY + 'px';
                }
                moveAt(event.clientX, event.clientY);
                dragMouseMoveHandler = function(e_move) { moveAt(e_move.clientX, e_move.clientY); };
                window.geminiExtensionGlobalDragMouseMove = dragMouseMoveHandler;
                dragMouseUpHandler = function() {
                    document.removeEventListener('mousemove', dragMouseMoveHandler);
                    document.removeEventListener('mouseup', dragMouseUpHandler);
                    if(handle) handle.style.userSelect = '';
                    window.geminiExtensionGlobalDragMouseMove = null;
                    window.geminiExtensionGlobalDragMouseUp = null;
                };
                window.geminiExtensionGlobalDragMouseUp = dragMouseUpHandler;
                document.addEventListener('mousemove', dragMouseMoveHandler);
                document.addEventListener('mouseup', dragMouseUpHandler);
                if(handle) handle.style.userSelect = 'none';
            };
            if(handle) handle.ondragstart = () => false;
        }

        function initResize(e) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            initialMouseX = e.clientX;
            initialMouseY = e.clientY;
            if (!popup) return;
            initialPopupWidth = popup.offsetWidth;
            initialPopupHeight = popup.offsetHeight;

            resizeMouseMoveHandler = function(eventMove) {
                const dx = eventMove.clientX - initialMouseX;
                const dy = eventMove.clientY - initialMouseY;
                let newWidth = initialPopupWidth + dx;
                let newHeight = initialPopupHeight + dy;
                const minWidth = 300;
                const minHeight = 200;
                if (popup) {
                    popup.style.width = Math.max(minWidth, newWidth) + 'px';
                    popup.style.height = Math.max(minHeight, newHeight) + 'px';
                }
            };

            resizeMouseUpHandler = function() {
                document.removeEventListener('mousemove', resizeMouseMoveHandler);
                document.removeEventListener('mouseup', resizeMouseUpHandler);
                if (document.body) document.body.style.cursor = 'default';
                if (popup) popup.style.userSelect = '';
                resizeMouseMoveHandler = null;
                resizeMouseUpHandler = null;
            };

            document.addEventListener('mousemove', resizeMouseMoveHandler);
            document.addEventListener('mouseup', resizeMouseUpHandler);
            if (document.body) document.body.style.cursor = 'nwse-resize';
            if (popup) popup.style.userSelect = 'none';
        }

        function alertUser(message) {
            if (responseArea && popup && popup.parentNode) {
                responseArea.textContent = message;
                responseArea.classList.add('error');
            } else {
                let tempErrorDiv = document.getElementById('gemini-temp-error');
                if (tempErrorDiv) tempErrorDiv.remove();
                tempErrorDiv = document.createElement('div');
                tempErrorDiv.id = 'gemini-temp-error';
                tempErrorDiv.textContent = message;
                document.body.appendChild(tempErrorDiv);
                setTimeout(() => { if (tempErrorDiv) tempErrorDiv.remove(); }, 7000);
            }
        }

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "someOtherActionFromBackground") {
                sendResponse({ status: "success", confirmation: "Action handled by content script." });
                return false;
            }
        });

        initSelection();

    } catch (e) {
        try {
            let errorFallbackDiv = document.getElementById('gemini-uncaught-error-fallback');
            if (errorFallbackDiv) errorFallbackDiv.remove();
            errorFallbackDiv = document.createElement('div');
            errorFallbackDiv.id = 'gemini-uncaught-error-fallback';
            errorFallbackDiv.style.position = 'fixed';
            errorFallbackDiv.style.top = '10px';
            errorFallbackDiv.style.left = '50%';
            errorFallbackDiv.style.transform = 'translateX(-50%)';
            errorFallbackDiv.style.backgroundColor = 'red';
            errorFallbackDiv.style.color = 'white';
            errorFallbackDiv.style.padding = '15px';
            errorFallbackDiv.style.border = '2px solid darkred';
            errorFallbackDiv.style.borderRadius = '8px';
            errorFallbackDiv.style.zIndex = '2147483647';
            errorFallbackDiv.style.fontFamily = 'Arial, sans-serif';
            errorFallbackDiv.style.fontSize = '16px';
            errorFallbackDiv.style.textAlign = 'center';
            errorFallbackDiv.textContent = `Extension Error: Gemini Vision Helper encountered a critical issue. Error: ${e.message}`;
            document.body.appendChild(errorFallbackDiv);
            setTimeout(() => { if (errorFallbackDiv) errorFallbackDiv.remove(); }, 10000);
        } catch (fallbackError) {
        }
    }
})();

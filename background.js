chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "geminiScreenshotHelper",
    title: "Capture for Gemini Vision",
    contexts: ["page", "selection"]
  });
  console.log("Gemini Vision Screenshot Helper context menu created/updated for page and selection contexts.");
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "geminiScreenshotHelper") {
    if (tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).then(() => {
        console.log("Injected content.js via context menu");
        return chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['styles.css']
        });
      }).then(() => {
        console.log("Inserted styles.css via context menu");
      }).catch(err => console.error('Failed to inject script or CSS via context menu:', err));
    } else {
      console.log('Cannot inject script into this URL via context menu:', tab ? tab.url : 'unknown tab');
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "captureVisibleTab") {
    if (sender.tab && sender.tab.id && sender.tab.windowId) {
      chrome.windows.update(sender.tab.windowId, { focused: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error focusing window (non-critical):", chrome.runtime.lastError.message);
        }
        chrome.tabs.captureVisibleTab(
          sender.tab.windowId,
          request.options || { format: "jpeg", quality: 90 },
          (dataUrl) => {
            if (chrome.runtime.lastError) {
              console.error("Error in captureVisibleTab:", chrome.runtime.lastError.message);
              sendResponse({ error: `Capture failed: ${chrome.runtime.lastError.message}` });
            } else if (dataUrl) {
              sendResponse(dataUrl);
            } else {
              console.error("captureVisibleTab returned undefined dataUrl without a specific chrome.runtime.lastError.");
              sendResponse({ error: "Capture failed: No image data received." });
            }
          }
        );
      });
    } else {
      console.error("captureVisibleTab request received without valid sender.tab details (id or windowId).");
      sendResponse({ error: "Capture failed: Could not identify the sender tab or window." });
    }
    return true;
  }
});

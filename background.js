chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["overlay.css"]
    });
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["overlay.js"]
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'captureTab') {
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
            sendResponse({ dataUrl });
        });
        return true; // Keep the message channel open for async response
    }
});
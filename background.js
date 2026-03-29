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
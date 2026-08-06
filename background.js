async function hasTotpForUrl(urlValue) {
  let host;
  try { host = new URL(urlValue).hostname.toLowerCase(); } catch (_) { return false; }
  const { entries = [], bindings = {} } = await chrome.storage.local.get(["entries", "bindings"]);
  const ids = bindings[host] || [];
  return entries.some(entry => ids.includes(entry.id) && entry.type === "totp");
}

async function updateIndicator(tabId, url) {
  if (!tabId) return;
  const available = await hasTotpForUrl(url);
  await chrome.action.setBadgeBackgroundColor({ tabId, color: available ? "#188038" : "#777777" });
  await chrome.action.setBadgeText({ tabId, text: available ? "✓" : "" });
  await chrome.action.setTitle({
    tabId,
    title: available ? "TOTP-код доступен для этого сайта" : "Для этого сайта нет привязанного TOTP-кода"
  });
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) updateIndicator(tabId, tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") updateIndicator(tabId, tab.url);
});

chrome.storage.onChanged.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) updateIndicator(tab.id, tab.url);
});

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) updateIndicator(tab.id, tab.url);
});

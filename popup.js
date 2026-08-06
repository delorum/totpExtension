let timer;
let displayedEntries = [];

async function activeTab() {
  return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
}

async function render() {
  const tab = await activeTab();
  let host = "";
  try { host = new URL(tab.url).hostname; } catch (_) {}
  document.querySelector("#host").textContent = host;
  const { entries = [], bindings = {} } = await chrome.storage.local.get(["entries", "bindings"]);
  const ids = bindings[host] || [];
  const matches = entries.filter(e => ids.includes(e.id) && e.type === "totp");
  displayedEntries = matches;
  document.querySelector("#empty").hidden = matches.length > 0;
  const list = document.querySelector("#list");
  list.replaceChildren();
  for (const entry of matches) {
    const code = await generateTotp(entry);
    const button = document.createElement("button");
    button.className = "code";
    button.dataset.entryId = entry.id;
    button.innerHTML = `<span><b>${escapeHtml(entry.issuer || entry.name)}</b><small>${escapeHtml(entry.name)}</small></span><em>${code}</em><i>${secondsLeft(entry)}с</i>`;
    button.onclick = async () => {
      const currentCode = await generateTotp(entry);
      const result = await chrome.tabs.sendMessage(tab.id, { type: "fill-totp", code: currentCode }).catch(() => null);
      if (!result?.ok) await navigator.clipboard.writeText(currentCode);
      button.classList.add("done");
      setTimeout(() => button.classList.remove("done"), 600);
    };
    list.append(button);
  }
  startTicker();
}

async function tick() {
  for (const entry of displayedEntries) {
    const button = document.querySelector(`[data-entry-id="${CSS.escape(entry.id)}"]`);
    if (!button) continue;
    button.querySelector("em").textContent = await generateTotp(entry);
    button.querySelector("i").textContent = `${secondsLeft(entry)}с`;
  }
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 20);
}

function startTicker() {
  clearTimeout(timer);
  const delay = 1000 - (Date.now() % 1000) + 20;
  timer = setTimeout(tick, delay);
}

function escapeHtml(value) { const d = document.createElement("div"); d.textContent = value || ""; return d.innerHTML; }
document.querySelector("#settings").onclick = () => chrome.runtime.openOptionsPage();
document.querySelector("#manage").onclick = async () => {
  const tab = await activeTab();
  let host = "";
  try { host = new URL(tab.url).hostname; } catch (_) {}
  chrome.tabs.create({ url: chrome.runtime.getURL(`options.html?domain=${encodeURIComponent(host)}`) });
};
render();

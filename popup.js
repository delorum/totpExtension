let timer;
let currentHost = "";
let currentTab;

async function call(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "Ошибка расширения");
  return response.result;
}

async function activeTab() {
  return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
}

async function showState() {
  currentTab = await activeTab();
  try { currentHost = new URL(currentTab.url).hostname; } catch (_) { currentHost = ""; }
  document.querySelector("#host").textContent = currentHost;
  const state = await call({ type: "vault-state" });
  const locked = !state.unlocked;
  document.querySelector("#locked").hidden = !locked;
  document.querySelector("#unlocked").hidden = locked;
  document.querySelector("#lock").hidden = locked;
  document.querySelector("#lock-message").textContent = state.configured
    ? "Введите мастер-пароль"
    : "Сначала создайте мастер-пароль в настройках";
  document.querySelector("#master-password").hidden = !state.configured;
  document.querySelector("#unlock").hidden = !state.configured;
  clearTimeout(timer);
  if (!locked) await tick();
}

async function tick() {
  const entry = await call({ type: "site-code", host: currentHost, touch: true }).catch(() => null);
  const list = document.querySelector("#list");
  document.querySelector("#empty").hidden = Boolean(entry);
  if (!entry) {
    list.replaceChildren();
  } else {
    let button = list.querySelector(".code");
    if (!button) {
      button = document.createElement("button");
      button.className = "code";
      button.innerHTML = "<span><b></b><small></small></span><em></em><i></i>";
      button.onclick = fillCurrentCode;
      list.replaceChildren(button);
    }
    button.querySelector("b").textContent = entry.issuer || entry.name;
    button.querySelector("small").textContent = entry.name;
    button.querySelector("em").textContent = entry.code;
    button.querySelector("i").textContent = `${entry.secondsLeft}с`;
  }
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 20);
}

async function fillCurrentCode() {
  const entry = await call({ type: "site-code", host: currentHost, touch: true }).catch(() => null);
  if (!entry) return showState();
  const result = await chrome.tabs.sendMessage(currentTab.id, { type: "fill-totp", code: entry.code }).catch(() => null);
  if (!result?.ok) await navigator.clipboard.writeText(entry.code);
  const button = document.querySelector(".code");
  button?.classList.add("done");
  setTimeout(() => button?.classList.remove("done"), 600);
}

document.querySelector("#unlock").onclick = async () => {
  const error = document.querySelector("#unlock-error");
  error.textContent = "";
  try {
    await call({ type: "unlock-vault", password: document.querySelector("#master-password").value });
    document.querySelector("#master-password").value = "";
    await showState();
  } catch (err) { error.textContent = err.message; }
};
document.querySelector("#master-password").onkeydown = event => { if (event.key === "Enter") document.querySelector("#unlock").click(); };
document.querySelector("#lock").onclick = async () => { await call({ type: "lock-vault" }); showState(); };
document.querySelector("#settings").onclick = () => chrome.runtime.openOptionsPage();
document.querySelector("#manage").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL(`options.html?domain=${encodeURIComponent(currentHost)}`) });
showState().catch(error => { document.querySelector("#unlock-error").textContent = error.message; });

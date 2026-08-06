const $ = s => document.querySelector(s);

function parseEntry(raw, index) {
  let url;
  try { url = new URL(raw.techInfo); } catch (_) {}
  const type = url?.hostname === "totp" ? "totp" : "unsupported";
  const label = url ? decodeURIComponent(url.pathname.slice(1)) : raw.name;
  return {
    id: crypto.randomUUID(), type, name: raw.name || label || `Код ${index + 1}`,
    issuer: url?.searchParams.get("issuer") || label?.split(":")[0] || "",
    secret: raw.secret || url?.searchParams.get("secret") || "",
    algorithm: (url?.searchParams.get("algorithm") || "SHA1").toUpperCase(),
    digits: Number(url?.searchParams.get("digits") || 6),
    period: Number(url?.searchParams.get("period") || 30),
    techInfo: raw.techInfo || ""
  };
}

function entryFromUri(uri) {
  const value = uri.trim();
  const url = new URL(value);
  if (url.protocol !== "otpauth:" || url.hostname !== "totp" || !url.searchParams.get("secret")) {
    throw new Error("Нужна ссылка otpauth://totp с параметром secret");
  }
  const label = decodeURIComponent(url.pathname.slice(1));
  const separator = label.indexOf(":");
  return parseEntry({
    name: separator >= 0 ? label.slice(separator + 1) : label,
    secret: url.searchParams.get("secret"),
    techInfo: value
  }, 0);
}

function entryUri(entry) {
  const issuer = entry.issuer || "TOTP";
  const label = `${issuer}:${entry.name || issuer}`;
  const params = new URLSearchParams({
    algorithm: entry.algorithm || "SHA1", digits: String(entry.digits || 6),
    secret: entry.secret, issuer, period: String(entry.period || 30)
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params}`;
}

async function importFile(file) {
  const json = JSON.parse(await file.text());
  if (!Array.isArray(json)) throw new Error("Ожидался JSON-массив");
  const entries = json.map(parseEntry).filter(e => e.secret);
  await chrome.storage.local.set({ entries });
  $("#status").textContent = `Импортировано: ${entries.filter(e => e.type === "totp").length}; неподдерживаемых: ${entries.filter(e => e.type !== "totp").length}`;
  await render();
}

async function render() {
  const { entries = [], bindings = {} } = await chrome.storage.local.get(["entries", "bindings"]);
  $("#entry").replaceChildren(...entries.filter(e => e.type === "totp").map(e => new Option(`${e.issuer} — ${e.name}`, e.id)));
  $("#entries").replaceChildren(...entries.map(entryRow));
  const byId = Object.fromEntries(entries.map(e => [e.id, e]));
  $("#bindings").replaceChildren(...Object.entries(bindings).map(([domain, binding]) => {
    const id = Array.isArray(binding) ? binding.at(-1) : binding;
    const div = document.createElement("div"); div.className = "row";
    const text = document.createElement("span"); text.textContent = `${domain} → ${byId[id]?.issuer || byId[id]?.name || "удалённый код"}`;
    const del = document.createElement("button"); del.textContent = "Удалить"; del.onclick = async () => { delete bindings[domain]; await chrome.storage.local.set({ bindings }); render(); };
    div.append(text, del); return div;
  }));
}

function entryRow(entry) {
  const div = document.createElement("div"); div.className = "row entry-row";
  const text = document.createElement("span");
  text.textContent = `${entry.issuer || "Без сервиса"} — ${entry.name}${entry.type === "totp" ? "" : " (yaotp: не поддерживается)"}`;
  const edit = document.createElement("button"); edit.textContent = "Изменить";
  edit.onclick = () => {
    const issuer = document.createElement("input"); issuer.value = entry.issuer || ""; issuer.placeholder = "Сервис";
    const name = document.createElement("input"); name.value = entry.name || ""; name.placeholder = "Имя";
    const save = document.createElement("button"); save.textContent = "Сохранить"; save.className = "save";
    const cancel = document.createElement("button"); cancel.textContent = "Отмена";
    save.onclick = async () => {
      const { entries = [] } = await chrome.storage.local.get("entries");
      const stored = entries.find(item => item.id === entry.id);
      if (!stored) return;
      stored.issuer = issuer.value.trim();
      stored.name = name.value.trim() || stored.name;
      await chrome.storage.local.set({ entries });
      render();
    };
    cancel.onclick = render;
    div.replaceChildren(issuer, name, save, cancel);
  };
  div.append(text, edit);
  return div;
}

$("#file").onchange = e => importFile(e.target.files[0]).catch(err => $("#status").textContent = `Ошибка: ${err.message}`);
$("#single").oninput = () => {
  try {
    const entry = entryFromUri($("#single").value);
    $("#single-issuer").value = entry.issuer;
    $("#single-name").value = entry.name;
    $("#status").textContent = "Ссылка распознана";
  } catch (_) {
    $("#single-issuer").value = "";
    $("#single-name").value = "";
  }
};
$("#add-single").onclick = async () => {
  try {
    const entry = entryFromUri($("#single").value);
    entry.issuer = $("#single-issuer").value.trim() || entry.issuer;
    entry.name = $("#single-name").value.trim() || entry.name;
    const { entries = [] } = await chrome.storage.local.get("entries");
    if (entries.some(item => item.secret === entry.secret && item.name === entry.name)) throw new Error("Такая запись уже существует");
    entries.push(entry);
    await chrome.storage.local.set({ entries });
    $("#single").value = "";
    $("#single-issuer").value = "";
    $("#single-name").value = "";
    $("#status").textContent = `Добавлен TOTP: ${entry.issuer || entry.name}`;
    render();
  } catch (err) { $("#status").textContent = `Ошибка: ${err.message}`; }
};
$("#export").onclick = async () => {
  const { entries = [] } = await chrome.storage.local.get("entries");
  const supported = entries.filter(entry => entry.type === "totp");
  const data = supported.map(entry => ({ name: entry.name, secret: entry.secret, techInfo: entryUri(entry) }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `totp_backup_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  const skipped = entries.length - supported.length;
  $("#status").textContent = `Экспортировано записей: ${data.length}${skipped ? `; yaotp пропущено: ${skipped}` : ""}`;
};
$("#bind").onclick = async () => {
  let domain = $("#domain").value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const id = $("#entry").value; if (!domain || !id) return;
  const { bindings = {} } = await chrome.storage.local.get("bindings");
  bindings[domain] = id;
  await chrome.storage.local.set({ bindings }); $("#domain").value = ""; render();
};
const requestedDomain = new URLSearchParams(location.search).get("domain");
if (requestedDomain) $("#domain").value = requestedDomain;
render();

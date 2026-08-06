const $ = s => document.querySelector(s);

async function call(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "unknown_request");
  return response.result;
}

function setFeedback(target, message, type = "info") {
  const element = typeof target === "string" ? $(target) : target;
  element.classList.remove("feedback-success", "feedback-error", "feedback-info");
  element.classList.add(`feedback-${type}`);
  element.textContent = message;
}

function parseEntry(raw, index) {
  let url;
  try { url = new URL(raw.techInfo); } catch (_) {}
  const type = url?.hostname === "totp" ? "totp" : "unsupported";
  const label = url ? decodeURIComponent(url.pathname.slice(1)) : raw.name;
  return {
    id: crypto.randomUUID(), type, name: raw.name || label || `TOTP ${index + 1}`,
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
    throw new Error("uri_required");
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
  if (!Array.isArray(json)) throw new Error("expected_array");
  const entries = json.map(parseEntry).filter(e => e.secret);
  await call({ type: "save-entries", entries });
  setFeedback("#status", t("import_result", { supported: entries.filter(e => e.type === "totp").length, unsupported: entries.filter(e => e.type !== "totp").length }), "success");
  await render();
}

async function render() {
  const state = await call({ type: "vault-state" });
  $("#vault-unconfigured").hidden = state.configured;
  $("#vault-locked").hidden = !state.configured || state.unlocked;
  $("#vault-unlocked").hidden = !state.unlocked;
  $("#vault-content").hidden = !state.unlocked;
  $("#lock-minutes").value = state.lockMinutes;
  if (!state.unlocked) return;
  const entries = await call({ type: "get-entries" });
  const { bindings = {} } = await chrome.storage.local.get("bindings");
  $("#entry").replaceChildren(...entries.filter(e => e.type === "totp").map(e => new Option(`${e.issuer} — ${e.name}`, e.id)));
  $("#entries").replaceChildren(...entries.map(entryRow));
  const byId = Object.fromEntries(entries.map(e => [e.id, e]));
  $("#bindings").replaceChildren(...Object.entries(bindings).flatMap(([domain, binding]) => {
    const ids = Array.isArray(binding) ? binding : (binding ? [binding] : []);
    return ids.map(id => {
    const div = document.createElement("div"); div.className = "row";
    const linked = byId[id];
    const label = linked ? [linked.issuer, linked.name].filter(Boolean).join(" — ") : t("removed_code");
    const text = document.createElement("span"); text.textContent = `${domain} → ${label}`;
    const del = document.createElement("button"); del.textContent = t("delete"); del.onclick = async () => {
      const remaining = ids.filter(item => item !== id);
      if (remaining.length) bindings[domain] = remaining; else delete bindings[domain];
      await chrome.storage.local.set({ bindings }); render();
    };
    div.append(text, del); return div;
    });
  }));
}

function entryRow(entry) {
  const div = document.createElement("div"); div.className = "row entry-row";
  const text = document.createElement("span");
  text.textContent = `${entry.issuer || t("no_service")} — ${entry.name}${entry.type === "totp" ? "" : t("unsupported_yaotp")}`;
  const edit = document.createElement("button"); edit.textContent = t("edit");
  edit.onclick = () => {
    const issuer = document.createElement("input"); issuer.value = entry.issuer || ""; issuer.placeholder = t("service");
    const name = document.createElement("input"); name.value = entry.name || ""; name.placeholder = t("account_name");
    const save = document.createElement("button"); save.textContent = t("save"); save.className = "save";
    const cancel = document.createElement("button"); cancel.textContent = t("cancel");
    save.onclick = async () => {
      const entries = await call({ type: "get-entries" });
      const stored = entries.find(item => item.id === entry.id);
      if (!stored) return;
      stored.issuer = issuer.value.trim();
      stored.name = name.value.trim() || stored.name;
      await call({ type: "save-entries", entries });
      render();
    };
    cancel.onclick = render;
    div.replaceChildren(issuer, name, save, cancel);
  };
  div.append(text, edit);
  return div;
}

function formattedError(err) { return t("error_prefix", { message: t(err.message) }); }
$("#file").onchange = e => importFile(e.target.files[0]).catch(err => setFeedback("#status", formattedError(err), "error"));
let pendingEntry = null;

$("#add-single").onclick = () => {
  try {
    pendingEntry = entryFromUri($("#single").value);
    $("#confirm-issuer").value = pendingEntry.issuer;
    $("#confirm-name").value = pendingEntry.name;
    $("#confirm-entry").showModal();
  } catch (err) { setFeedback("#status", formattedError(err), "error"); }
};

$("#cancel-entry").onclick = () => {
  pendingEntry = null;
  $("#confirm-entry").close();
};

$("#confirm-entry").oncancel = () => { pendingEntry = null; };

$("#save-entry").onclick = async () => {
  if (!pendingEntry) return;
  try {
    const entry = pendingEntry;
    entry.issuer = $("#confirm-issuer").value.trim() || entry.issuer;
    entry.name = $("#confirm-name").value.trim() || entry.name;
    const entries = await call({ type: "get-entries" });
    if (entries.some(item => item.secret === entry.secret && item.name === entry.name)) throw new Error("duplicate_entry");
    entries.push(entry);
    await call({ type: "save-entries", entries });
    $("#single").value = "";
    pendingEntry = null;
    $("#confirm-entry").close();
    setFeedback("#status", t("added_totp", { name: entry.issuer || entry.name }), "success");
    render();
  } catch (err) { setFeedback("#status", formattedError(err), "error"); }
};
$("#export").onclick = async () => {
  try {
    const entries = await call({ type: "get-entries" });
    const supported = entries.filter(entry => entry.type === "totp");
    const data = supported.map(entry => ({ name: entry.name, secret: entry.secret, techInfo: entryUri(entry) }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `totp_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    const skipped = entries.length - supported.length;
    setFeedback("#status", t("export_result", { count: data.length, skipped: skipped ? t("skipped_yaotp", { count: skipped }) : "" }), "success");
  } catch (err) { setFeedback("#status", formattedError(err), "error"); }
};
$("#bind").onclick = async () => {
  let domain = $("#domain").value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const id = $("#entry").value; if (!domain || !id) return;
  const { bindings = {} } = await chrome.storage.local.get("bindings");
  const current = Array.isArray(bindings[domain]) ? bindings[domain] : (bindings[domain] ? [bindings[domain]] : []);
  bindings[domain] = [...new Set([...current, id])];
  await chrome.storage.local.set({ bindings }); $("#domain").value = ""; render();
};
const requestedDomain = new URLSearchParams(location.search).get("domain");
if (requestedDomain) $("#domain").value = requestedDomain;

async function securityAction(action) {
  const status = $("#security-status");
  setFeedback(status, "", "info");
  try {
    await action();
    await render();
  } catch (err) {
    setFeedback(status, formattedError(err), "error");
  }
}

function securitySuccess(message) {
  setFeedback("#security-status", message, "success");
}

$("#setup-vault").onclick = () => securityAction(async () => {
  await call({ type: "setup-vault", password: $("#setup-password").value });
  $("#setup-password").value = "";
  securitySuccess(t("master_created"));
});
$("#options-unlock").onclick = () => securityAction(async () => {
  await call({ type: "unlock-vault", password: $("#options-password").value });
  $("#options-password").value = "";
});
$("#options-password").onkeydown = event => { if (event.key === "Enter") $("#options-unlock").click(); };
$("#lock-now").onclick = () => securityAction(() => call({ type: "lock-vault" }));
$("#save-timeout").onclick = () => securityAction(async () => {
  await call({ type: "set-lock-minutes", minutes: Number($("#lock-minutes").value) });
  securitySuccess(t("timeout_saved"));
});
$("#change-password").onclick = () => securityAction(async () => {
  await call({ type: "change-password", currentPassword: $("#current-password").value, newPassword: $("#new-password").value });
  $("#current-password").value = "";
  $("#new-password").value = "";
  securitySuccess(t("master_changed"));
});

chrome.runtime.onMessage.addListener(message => { if (message.type === "vault-state-changed") render().catch(() => {}); });
async function init() {
  const { locale = "en" } = await chrome.storage.local.get("locale");
  setLocale(locale);
  $("#language").value = getLocale();
  applyI18n();
  document.title = `${t("app_name")} — ${t("settings")}`;
  await render();
}
$("#language").onchange = async event => {
  const locale = event.target.value === "ru" ? "ru" : "en";
  await chrome.storage.local.set({ locale });
  setLocale(locale);
  applyI18n();
  document.title = `${t("app_name")} — ${t("settings")}`;
  setFeedback("#status", "", "info");
  setFeedback("#security-status", "", "info");
  await render();
};
init().catch(err => setFeedback("#security-status", formattedError(err), "error"));

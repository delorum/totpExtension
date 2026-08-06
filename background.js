importScripts("totp.js");

const ITERATIONS = 310000;
const DEFAULT_LOCK_MINUTES = 15;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

async function deriveKey(password, salt, extractable = false) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

async function encryptEntries(entries, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, true);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(entries)));
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return {
    vault: { version: 1, iterations: ITERATIONS, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) },
    rawKey
  };
}

async function decryptVault(vault, key) {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(vault.iv) }, key, base64ToBytes(vault.ciphertext)
    );
    const entries = JSON.parse(decoder.decode(plaintext));
    if (!Array.isArray(entries)) throw new Error("Invalid vault");
    return entries;
  } catch (_) { throw new Error("Неверный мастер-пароль"); }
}

async function keyFromPassword(password, vault) {
  return deriveKey(password, base64ToBytes(vault.salt), true);
}

async function keyFromSession(rawKey) {
  return crypto.subtle.importKey("raw", base64ToBytes(rawKey), "AES-GCM", true, ["encrypt", "decrypt"]);
}

async function lockMinutes() {
  const stored = await chrome.storage.local.get("lockMinutes");
  return Number(stored.lockMinutes || DEFAULT_LOCK_MINUTES);
}

async function touchSession(values = {}) {
  const minutes = await lockMinutes();
  await chrome.storage.session.set({ ...values, expiresAt: Date.now() + minutes * 60000 });
}

async function unlockedSession(touch = false) {
  const session = await chrome.storage.session.get(["vaultEntries", "vaultKey", "expiresAt"]);
  if (!session.vaultEntries || !session.vaultKey || !session.expiresAt || session.expiresAt <= Date.now()) {
    await chrome.storage.session.remove(["vaultEntries", "vaultKey", "expiresAt"]);
    return null;
  }
  if (touch) await touchSession();
  return session;
}

async function lockVault() {
  await chrome.storage.session.remove(["vaultEntries", "vaultKey", "expiresAt"]);
  await updateAllIndicators();
}

async function saveEncryptedEntries(entries) {
  const session = await unlockedSession(true);
  if (!session) throw new Error("Расширение заблокировано");
  const key = await keyFromSession(session.vaultKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(entries)));
  const { vault } = await chrome.storage.local.get("vault");
  await chrome.storage.local.set({ vault: { ...vault, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) } });
  await touchSession({ vaultEntries: entries });
  await updateAllIndicators();
}

async function setupVault(password) {
  if (!password) throw new Error("Введите мастер-пароль");
  const stored = await chrome.storage.local.get(["vault", "entries"]);
  if (stored.vault) throw new Error("Мастер-пароль уже настроен");
  const entries = stored.entries || [];
  const { vault, rawKey } = await encryptEntries(entries, password);
  await chrome.storage.local.set({ vault, lockMinutes: DEFAULT_LOCK_MINUTES });
  await chrome.storage.local.remove("entries");
  await touchSession({ vaultEntries: entries, vaultKey: bytesToBase64(rawKey) });
  await updateAllIndicators();
}

async function unlockVault(password) {
  const { vault } = await chrome.storage.local.get("vault");
  if (!vault) throw new Error("Мастер-пароль ещё не настроен");
  const key = await keyFromPassword(password, vault);
  const entries = await decryptVault(vault, key);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  await touchSession({ vaultEntries: entries, vaultKey: bytesToBase64(rawKey) });
  await updateAllIndicators();
}

async function changePassword(currentPassword, newPassword) {
  if (!newPassword) throw new Error("Введите новый мастер-пароль");
  const { vault } = await chrome.storage.local.get("vault");
  if (!vault) throw new Error("Мастер-пароль ещё не настроен");
  const currentKey = await keyFromPassword(currentPassword, vault);
  const entries = await decryptVault(vault, currentKey);
  const encrypted = await encryptEntries(entries, newPassword);
  await chrome.storage.local.set({ vault: encrypted.vault });
  await touchSession({ vaultEntries: entries, vaultKey: bytesToBase64(encrypted.rawKey) });
}

async function vaultState() {
  const local = await chrome.storage.local.get(["vault", "entries", "lockMinutes"]);
  const session = await unlockedSession(false);
  return {
    configured: Boolean(local.vault), unlocked: Boolean(session),
    legacyEntries: local.vault ? 0 : (local.entries || []).length,
    lockMinutes: Number(local.lockMinutes || DEFAULT_LOCK_MINUTES)
  };
}

function bindingId(binding) { return Array.isArray(binding) ? binding.at(-1) : binding; }

async function siteEntry(host, touch = false) {
  const session = await unlockedSession(touch);
  if (!session) return null;
  const { bindings = {} } = await chrome.storage.local.get("bindings");
  const id = bindingId(bindings[String(host || "").toLowerCase()]);
  return session.vaultEntries.find(entry => entry.id === id && entry.type === "totp") || null;
}

async function siteCode(host, touch = false) {
  const entry = await siteEntry(host, touch);
  if (!entry) return null;
  return { id: entry.id, issuer: entry.issuer, name: entry.name, code: await generateTotp(entry), secondsLeft: secondsLeft(entry) };
}

function trustedSender(sender) { return !sender.tab; }

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    switch (message.type) {
      case "vault-state": return vaultState();
      case "setup-vault": if (!trustedSender(sender)) throw new Error("Недопустимый запрос"); await setupVault(message.password); return vaultState();
      case "unlock-vault": if (!trustedSender(sender)) throw new Error("Недопустимый запрос"); await unlockVault(message.password); return vaultState();
      case "lock-vault": if (!trustedSender(sender)) throw new Error("Недопустимый запрос"); await lockVault(); return vaultState();
      case "change-password": if (!trustedSender(sender)) throw new Error("Недопустимый запрос"); await changePassword(message.currentPassword, message.newPassword); return vaultState();
      case "set-lock-minutes": {
        if (!trustedSender(sender)) throw new Error("Недопустимый запрос");
        const minutes = Number(message.minutes);
        if (!Number.isFinite(minutes) || minutes < 1) throw new Error("Укажите не меньше одной минуты");
        await chrome.storage.local.set({ lockMinutes: minutes });
        if (await unlockedSession(false)) await touchSession();
        return vaultState();
      }
      case "get-entries": {
        if (!trustedSender(sender)) throw new Error("Недопустимый запрос");
        const session = await unlockedSession(true);
        if (!session) throw new Error("Расширение заблокировано");
        return session.vaultEntries;
      }
      case "save-entries": if (!trustedSender(sender)) throw new Error("Недопустимый запрос"); await saveEncryptedEntries(message.entries); return { ok: true };
      case "site-code": {
        let host = message.host;
        if (sender.tab?.url) {
          try { host = new URL(sender.tab.url).hostname; } catch (_) { host = ""; }
        }
        return siteCode(host, Boolean(message.touch));
      }
      default: throw new Error("Неизвестный запрос");
    }
  })().then(result => reply({ ok: true, result })).catch(error => reply({ ok: false, error: error.message }));
  return true;
});

async function hasTotpForUrl(urlValue) {
  let host;
  try { host = new URL(urlValue).hostname.toLowerCase(); } catch (_) { return false; }
  return Boolean(await siteEntry(host));
}

async function updateIndicator(tabId, url) {
  if (!tabId) return;
  const available = await hasTotpForUrl(url);
  await chrome.action.setBadgeBackgroundColor({ tabId, color: available ? "#188038" : "#777777" }).catch(() => {});
  await chrome.action.setBadgeText({ tabId, text: available ? "✓" : "" }).catch(() => {});
  await chrome.action.setTitle({ tabId, title: available ? "TOTP-код доступен для этого сайта" : "Нет доступного TOTP-кода или расширение заблокировано" }).catch(() => {});
}

async function updateAllIndicators() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    updateIndicator(tab.id, tab.url);
    chrome.tabs.sendMessage(tab.id, { type: "vault-state-changed" }).catch(() => {});
  }
}

async function configureStorageAccess() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => { const tab = await chrome.tabs.get(tabId).catch(() => null); if (tab) updateIndicator(tabId, tab.url); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => { if (changeInfo.url || changeInfo.status === "complete") updateIndicator(tabId, tab.url); });
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local") updateAllIndicators(); });
chrome.alarms.onAlarm.addListener(async alarm => { if (alarm.name === "vault-lock-check") { await unlockedSession(false); updateAllIndicators(); } });
chrome.runtime.onInstalled.addListener(async () => { await configureStorageAccess(); await chrome.alarms.create("vault-lock-check", { periodInMinutes: 0.5 }); updateAllIndicators(); });
chrome.runtime.onStartup.addListener(async () => { await configureStorageAccess(); await lockVault(); await chrome.alarms.create("vault-lock-check", { periodInMinutes: 0.5 }); });
configureStorageAccess();
chrome.alarms.create("vault-lock-check", { periodInMinutes: 0.5 });

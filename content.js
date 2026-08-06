function scoreField(el) {
  const label = el.labels ? [...el.labels].map(item => item.textContent).join(" ") : "";
  const context = el.closest("label, fieldset, form, [role='group']")?.textContent?.slice(0, 500) || "";
  const text = [el.name, el.id, el.placeholder, el.autocomplete, el.getAttribute("aria-label"), label, context]
    .filter(Boolean).join(" ").toLowerCase();
  let score = 0;
  if (/otp|totp|one.?time|2fa|mfa|auth.?code|verification.?code/.test(text)) score += 10;
  if (/код|однораз|подтвержд|провер|одноразовый пароль/.test(text)) score += 8;
  if (el.autocomplete === "one-time-code") score += 20;
  if (el.inputMode === "numeric" || el.type === "tel") score += 2;
  if ([6, 8].includes(Number(el.maxLength))) score += 2;
  return score;
}

function bestField() {
  return [...document.querySelectorAll("input:not([disabled]):not([readonly])")]
    .filter(el => el.offsetParent !== null && !["hidden", "submit", "button", "checkbox", "radio"].includes(el.type))
    .map(el => ({ el, score: scoreField(el) }))
    .sort((a, b) => b.score - a.score)[0];
}

function otpFieldGroup() {
  const candidates = [...document.querySelectorAll("input:not([disabled]):not([readonly])")]
    .filter(el => el.offsetParent !== null && (el.maxLength === 1 || el.size === 1));
  if (candidates.length < 3) return [];
  for (let length = Math.min(10, candidates.length); length >= 3; length--) {
    for (let i = 0; i <= candidates.length - length; i++) {
      const group = candidates.slice(i, i + length);
      const rects = group.map(el => el.getBoundingClientRect());
      const sameRow = Math.max(...rects.map(rect => rect.top)) - Math.min(...rects.map(rect => rect.top)) < 24;
      const ordered = rects.every((rect, index) => index === 0 || rect.left > rects[index - 1].left);
      const nearby = rects.every((rect, index) => index === 0 || rect.left - rects[index - 1].right < 40);
      if (sameRow && ordered && nearby) return group;
    }
  }
  return [];
}

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

let suggestion;

function removeSuggestion() {
  suggestion?.remove();
  suggestion = null;
}

async function matchingEntries() {
  const host = location.hostname.toLowerCase();
  const response = await chrome.runtime.sendMessage({ type: "site-codes", host }).catch(() => null);
  return response?.ok && Array.isArray(response.result) ? response.result : [];
}

async function showSuggestion() {
  if (window !== top) return;
  const entries = await matchingEntries();
  if (!entries.length) { removeSuggestion(); return; }
  const found = bestField();
  const group = otpFieldGroup();
  if ((!found || found.score <= 0) && !group.length) { removeSuggestion(); return; }

  if (!suggestion) {
    suggestion = document.createElement("div");
    suggestion.id = "totp-extension-suggestion";
    Object.assign(suggestion.style, {
      position: "fixed", zIndex: "2147483647", display: "flex", flexDirection: "column",
      gap: "4px", minWidth: "220px", padding: "6px", border: "1px solid #d7dce3",
      borderRadius: "10px", background: "white", boxShadow: "0 5px 24px #0003",
      font: "14px system-ui, sans-serif", color: "#202124"
    });
    document.documentElement.append(suggestion);
  }

  const target = group[0] || found.el;
  const rect = target.getBoundingClientRect();
  suggestion.style.left = `${Math.max(8, Math.min(innerWidth - 236, rect.left))}px`;
  suggestion.style.top = `${Math.min(innerHeight - 60, rect.bottom + 6)}px`;
  suggestion.replaceChildren();
  for (const entry of entries) {
    const code = entry.code;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = entries.length > 1 ? `TOTP · ${entry.name || entry.issuer}: ${code}` : `TOTP: ${code}`;
    Object.assign(button.style, { border: "0", borderRadius: "7px", padding: "9px 11px", background: "#2878e3", color: "white", cursor: "pointer", font: "inherit", textAlign: "left" });
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", async () => {
      const response = await chrome.runtime.sendMessage({ type: "site-codes", host: location.hostname, touch: true }).catch(() => null);
      const currentCode = response?.result?.find(item => item.id === entry.id)?.code;
      if (!currentCode) { removeSuggestion(); return; }
      const currentGroup = otpFieldGroup();
      if (currentGroup.length) {
        currentGroup.forEach((input, index) => setInputValue(input, currentCode[index] || ""));
        currentGroup[currentGroup.length - 1].focus();
        removeSuggestion();
        return;
      }
      const input = bestField()?.el;
      if (!input) return;
      setInputValue(input, currentCode);
      input.focus();
      removeSuggestion();
    });
    suggestion.append(button);
  }
}

let scanTimer;
let recognitionActive = false;
let fieldObserver;

function scheduleScan() {
  if (!recognitionActive) return;
  clearTimeout(scanTimer);
  scanTimer = setTimeout(showSuggestion, 150);
}

function startRecognition() {
  if (recognitionActive || window !== top) return;
  recognitionActive = true;
  fieldObserver = new MutationObserver(mutations => {
    if (suggestion && mutations.every(mutation => suggestion.contains(mutation.target))) return;
    scheduleScan();
  });
  fieldObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["type", "name", "placeholder", "autocomplete"] });
  addEventListener("focusin", scheduleScan);
  addEventListener("resize", scheduleScan);
  addEventListener("scroll", scheduleScan, true);
  scheduleScan();
}

function stopRecognition() {
  if (!recognitionActive) return;
  recognitionActive = false;
  clearTimeout(scanTimer);
  fieldObserver?.disconnect();
  fieldObserver = null;
  removeEventListener("focusin", scheduleScan);
  removeEventListener("resize", scheduleScan);
  removeEventListener("scroll", scheduleScan, true);
  removeSuggestion();
}

async function refreshRecognition() {
  const entries = await matchingEntries();
  if (entries.length) startRecognition(); else stopRecognition();
}

refreshRecognition();

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type === "vault-state-changed") {
    refreshRecognition();
    reply({ ok: true });
    return;
  }
  if (message.type === "field-status") {
    const found = bestField();
    reply({ found: Boolean(found && found.score > 0) });
  }
  if (message.type === "fill-totp") {
    const group = otpFieldGroup();
    if (group.length) {
      group.forEach((input, index) => setInputValue(input, message.code[index] || ""));
      group[group.length - 1].focus();
      reply({ ok: true });
      return;
    }
    const found = bestField();
    if (!found || found.score <= 0) { reply({ ok: false }); return; }
    const input = found.el;
    setInputValue(input, message.code);
    input.focus();
    reply({ ok: true });
  }
});

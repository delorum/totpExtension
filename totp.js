const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(value) {
  const input = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of input) bits += B32.indexOf(char).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

async function generateTotp(entry, now = Date.now()) {
  const period = Number(entry.period || 30);
  const digits = Number(entry.digits || 6);
  const counter = Math.floor(now / 1000 / period);
  const message = new Uint8Array(8);
  let n = counter;
  for (let i = 7; i >= 0; i--) { message[i] = n & 255; n = Math.floor(n / 256); }
  const algorithm = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" }[entry.algorithm] || "SHA-1";
  const key = await crypto.subtle.importKey("raw", decodeBase32(entry.secret), { name: "HMAC", hash: algorithm }, false, ["sign"]);
  const hash = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = hash[hash.length - 1] & 15;
  const binary = ((hash[offset] & 127) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

function secondsLeft(entry, now = Date.now()) {
  const period = Number(entry.period || 30);
  return period - (Math.floor(now / 1000) % period);
}

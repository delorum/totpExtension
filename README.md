# TOTP Autofill for Yandex Browser

[Русская версия](README.ru.md)

A small Manifest V3 browser extension that keeps TOTP credentials locally, associates them with exact website hostnames, and makes one-time codes easy to enter.

It was created for authentication pages where repeatedly opening a phone authenticator is inconvenient. When a TOTP credential is associated with the current hostname, the extension shows a green `✓` badge and offers the current code near a detected verification field. Codes can also be selected from the toolbar popup.

## Features

- Import a Yandex Key JSON backup containing `name`, `secret`, and `techInfo` fields.
- Add one credential from an `otpauth://totp/...` URI.
- Edit the local service and account labels without changing generated codes.
- Export standard TOTP credentials to the same JSON format accepted by file import.
- Encrypt the credential database with AES-256-GCM under a user-defined master password.
- Change the master password, lock explicitly, or lock automatically after a configurable number of inactive minutes.
- Associate one or more credentials with each exact hostname.
- Detect a single verification input or a group of 3–10 one-character inputs.
- Display the code near a detected field and fill it on click.
- Show a green toolbar badge when a credential is available for the current hostname.
- Run field detection only on hostnames that have an association.
- Generate SHA-1, SHA-256, and SHA-512 TOTP codes locally with the Web Crypto API.

## Install in Yandex Browser

1. Clone or download this repository.
2. Open `browser://extensions`.
3. Enable Developer mode.
4. Select **Load unpacked extension** and choose the repository directory.
5. Open the extension settings and import a backup or add an `otpauth://totp` URI.
6. Associate a credential with the required exact hostname, for example `esia.gosuslugi.ru`.

On the first run after installation or upgrade, open the settings and create a master password. Existing plaintext credentials from an earlier version are encrypted during this migration. There are no password-complexity requirements, but a strong unique password is recommended. A forgotten master password cannot be recovered; restore the database by importing a backup into a fresh vault.

The easiest way to create an association is directly from the website page that displays the one-time-code form: open the extension popup and select **Associate a credential with this website**. The exact hostname of that page will be filled in automatically.

After modifying the source, reload the extension on `browser://extensions` and refresh open website tabs.

## Import and export

File import accepts a JSON array compatible with a Yandex Key export:

```json
[
  {
    "name": "account@example.com",
    "secret": "BASE32_SECRET",
    "techInfo": "otpauth://totp/Example:account%40example.com?secret=BASE32_SECRET&issuer=Example"
  }
]
```

Export produces the same structure. The proprietary `otpauth://yaotp` scheme is not standard TOTP and is deliberately excluded from export and code generation.

## Security model

- The credential database is encrypted with AES-256-GCM before it is stored in `chrome.storage.local`.
- PBKDF2-HMAC-SHA-256 with a random salt and 310,000 iterations derives the encryption key from the master password.
- While unlocked, the key and decrypted entries live in `chrome.storage.session`; they are removed by explicit lock, inactivity timeout, and browser restart.
- TOTP calculation happens locally; the extension does not make network requests.
- Content scripts cannot access extension storage or TOTP secrets. They request only the current short-lived code from the service worker.
- A code is written into the page only after the user clicks the suggestion or popup entry.
- Encryption protects a copied browser profile or offline disk data, but it does not protect an unlocked browser from malware, memory inspection, or keylogging.
- Imported and exported backup files contain plaintext TOTP secrets and should be protected like passwords or recovery codes.

Using the same standard TOTP secret in this extension and a phone authenticator does not invalidate either copy. Both independently calculate the same time-based code. Removing or rotating the TOTP credential on the service itself will invalidate all copies.

## Browser compatibility

The extension targets Chromium Manifest V3 and is developed for Yandex Browser. It may also work in other Chromium-based browsers, but they are not currently tested.

## License

No license has been selected yet. All rights are reserved by the repository owner.

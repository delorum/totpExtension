const MESSAGES = {
  en: {
    app_name: "TOTP Autofill", settings: "Settings", lock: "Lock", unlock: "Unlock",
    enter_master: "Enter master password", create_master_first: "Create a master password in Settings first",
    master_password: "Master password", no_code: "No TOTP credential is associated with this website.",
    associate_site: "Associate a credential with this website", storage_protection: "Vault protection",
    language: "Language", english: "English", russian: "Russian",
    setup_intro: "Create a master password to encrypt existing and new TOTP secrets with AES-GCM.",
    new_master: "New master password", create_master: "Create master password", vault_locked: "The vault is locked.",
    vault_unlocked: "The vault is unlocked", lock_after: "Lock after", inactivity_minutes: "minutes of inactivity",
    save_timeout: "Save timeout", lock_now: "Lock now", change_master: "Change master password",
    current_master: "Current master password", change: "Change", import_export: "Import and export",
    import_intro: "Select a Yandex Key key_backup.txt export. Imported secrets are stored only in the encrypted vault.",
    import_file: "Import file", export_database: "Export database", add_one: "Add one credential",
    add_uri_intro: "Paste an otpauth://totp/... URI from a QR code.", add_totp: "Add TOTP",
    site_association: "Website association", association_intro: "Multiple TOTP credentials can be associated with one hostname.",
    domain_placeholder: "example.com", add: "Add", codes: "Credentials", review_totp: "Review TOTP",
    labels_note: "You can edit these labels; they do not affect code generation.", service: "Service", account_name: "Name",
    cancel: "Cancel", save: "Save", delete: "Remove", edit: "Edit", unsupported_yaotp: " (yaotp: unsupported)",
    no_service: "No service", removed_code: "removed credential", uri_required: "An otpauth://totp URI with a secret parameter is required",
    expected_array: "Expected a JSON array", duplicate_entry: "This credential already exists",
    password_required: "Enter a master password", already_configured: "A master password is already configured",
    wrong_password: "Incorrect master password", not_configured: "A master password is not configured yet",
    extension_locked: "The extension is locked", invalid_request: "Invalid request", timeout_minimum: "Enter at least one minute",
    unknown_request: "Unknown request", import_result: "Imported: {supported}; unsupported: {unsupported}",
    added_totp: "TOTP added: {name}", export_result: "Exported credentials: {count}{skipped}",
    skipped_yaotp: "; yaotp skipped: {count}", error_prefix: "Error: {message}",
    master_created: "Master password created; the database is encrypted", timeout_saved: "Auto-lock timeout saved",
    master_changed: "Master password changed", association_saved: "Website association added",
    code_available: "A TOTP code is available for this website", no_code_available: "No TOTP code is available or the extension is locked", seconds_short: "s"
  },
  ru: {
    app_name: "TOTP Подстановка", settings: "Настройки", lock: "Заблокировать", unlock: "Разблокировать",
    enter_master: "Введите мастер-пароль", create_master_first: "Сначала создайте мастер-пароль в настройках",
    master_password: "Мастер-пароль", no_code: "Для этого сайта код не привязан.",
    associate_site: "Привязать код к сайту", storage_protection: "Защита хранилища",
    language: "Язык", english: "Английский", russian: "Русский",
    setup_intro: "Создайте мастер-пароль, чтобы зашифровать существующие и новые TOTP-секреты с помощью AES-GCM.",
    new_master: "Новый мастер-пароль", create_master: "Создать мастер-пароль", vault_locked: "Хранилище заблокировано.",
    vault_unlocked: "Хранилище разблокировано", lock_after: "Блокировать после", inactivity_minutes: "минут неактивности",
    save_timeout: "Сохранить время", lock_now: "Заблокировать сейчас", change_master: "Сменить мастер-пароль",
    current_master: "Текущий мастер-пароль", change: "Изменить", import_export: "Импорт и экспорт",
    import_intro: "Выберите экспорт key_backup.txt из «Яндекс Ключа». После импорта секреты сохраняются только в зашифрованном хранилище.",
    import_file: "Импортировать файл", export_database: "Экспортировать базу", add_one: "Добавить один код",
    add_uri_intro: "Вставьте ссылку из QR-кода вида otpauth://totp/...", add_totp: "Добавить TOTP",
    site_association: "Привязка сайта", association_intro: "К одному домену можно привязать несколько TOTP-кодов.",
    domain_placeholder: "example.com", add: "Добавить", codes: "Коды", review_totp: "Проверьте TOTP",
    labels_note: "Эти подписи можно изменить — на вычисление кода они не влияют.", service: "Сервис", account_name: "Имя",
    cancel: "Отмена", save: "Сохранить", delete: "Удалить", edit: "Изменить", unsupported_yaotp: " (yaotp: не поддерживается)",
    no_service: "Без сервиса", removed_code: "удалённый код", uri_required: "Нужна ссылка otpauth://totp с параметром secret",
    expected_array: "Ожидался JSON-массив", duplicate_entry: "Такая запись уже существует",
    password_required: "Введите мастер-пароль", already_configured: "Мастер-пароль уже настроен",
    wrong_password: "Неверный мастер-пароль", not_configured: "Мастер-пароль ещё не настроен",
    extension_locked: "Расширение заблокировано", invalid_request: "Недопустимый запрос", timeout_minimum: "Укажите не меньше одной минуты",
    unknown_request: "Неизвестный запрос", import_result: "Импортировано: {supported}; неподдерживаемых: {unsupported}",
    added_totp: "Добавлен TOTP: {name}", export_result: "Экспортировано записей: {count}{skipped}",
    skipped_yaotp: "; yaotp пропущено: {count}", error_prefix: "Ошибка: {message}",
    master_created: "Мастер-пароль создан, существующая база зашифрована", timeout_saved: "Время автоблокировки сохранено",
    master_changed: "Мастер-пароль изменён", association_saved: "Привязка к сайту добавлена",
    code_available: "TOTP-код доступен для этого сайта", no_code_available: "Нет доступного TOTP-кода или расширение заблокировано", seconds_short: "с"
  }
};

let activeLocale = "en";
function setLocale(locale) { activeLocale = locale === "ru" ? "ru" : "en"; if (typeof document !== "undefined") document.documentElement.lang = activeLocale; }
function getLocale() { return activeLocale; }
function t(key, values = {}) {
  let message = MESSAGES[activeLocale]?.[key] ?? MESSAGES.en[key] ?? key;
  for (const [name, value] of Object.entries(values)) message = message.replaceAll(`{${name}}`, value);
  return message;
}
function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(element => { element.textContent = t(element.dataset.i18n); });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(element => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  root.querySelectorAll("[data-i18n-title]").forEach(element => { element.title = t(element.dataset.i18nTitle); });
}

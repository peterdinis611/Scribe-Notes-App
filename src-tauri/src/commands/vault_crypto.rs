//! Vault AES-GCM / PBKDF2 — keeps key derivation + seal off the JS heap.

use scribe_core::{
    create_vault_verifier, decrypt_content_json, encrypt_content_json, is_vault_cipher_json,
    verify_vault_password,
};

#[tauri::command]
pub fn vault_create_verifier(password: String) -> Result<String, String> {
    create_vault_verifier(&password)
}

#[tauri::command]
pub fn vault_verify_password(password: String, verifier_json: String) -> bool {
    verify_vault_password(&password, &verifier_json)
}

#[tauri::command]
pub fn vault_encrypt_content(password: String, content_json: String) -> Result<String, String> {
    encrypt_content_json(&password, &content_json)
}

#[tauri::command]
pub fn vault_decrypt_content(password: String, cipher_json: String) -> Result<String, String> {
    decrypt_content_json(&password, &cipher_json)
}

#[tauri::command]
pub fn vault_is_cipher_json(content_json: String) -> bool {
    is_vault_cipher_json(&content_json)
}

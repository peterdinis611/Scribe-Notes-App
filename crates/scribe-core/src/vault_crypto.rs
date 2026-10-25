//! AES-GCM vault payload crypto (compatible with the former Web Crypto FE format).
//!
//! Payload shape: `{ "type":"scribe-vault-v1", "salt", "iv", "ct" }` (base64).
//! Verifier: `{ "salt", "iv", "proof" }` sealing the UTF-8 challenge `scribe-vault-verify`.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;
use serde_json::{json, Value};

pub const VAULT_MARKER: &str = "scribe-vault-v1";
pub const PBKDF2_ITERATIONS: u32 = 210_000;
const SALT_LEN: usize = 16;
const IV_LEN: usize = 12;
const VERIFY_CHALLENGE: &[u8] = b"scribe-vault-verify";

pub fn is_vault_cipher_json(content_json: &str) -> bool {
    serde_json::from_str::<Value>(content_json)
        .ok()
        .and_then(|v| v.get("type")?.as_str().map(|t| t == VAULT_MARKER))
        .unwrap_or(false)
}

fn derive_key(password: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

fn random_bytes(len: usize) -> Vec<u8> {
    let mut buf = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut buf);
    buf
}

pub fn create_vault_verifier(password: &str) -> Result<String, String> {
    let salt = random_bytes(SALT_LEN);
    let iv = random_bytes(IV_LEN);
    let key = derive_key(password, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&iv);
    let sealed = cipher
        .encrypt(nonce, VERIFY_CHALLENGE)
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "salt": B64.encode(salt),
        "iv": B64.encode(iv),
        "proof": B64.encode(sealed),
    })
    .to_string())
}

pub fn verify_vault_password(password: &str, verifier_json: &str) -> bool {
    let Ok(verifier) = serde_json::from_str::<Value>(verifier_json) else {
        return false;
    };
    let (Ok(salt), Ok(iv), Ok(proof)) = (
        decode_b64(verifier.get("salt").and_then(Value::as_str)),
        decode_b64(verifier.get("iv").and_then(Value::as_str)),
        decode_b64(verifier.get("proof").and_then(Value::as_str)),
    ) else {
        return false;
    };
    let key = derive_key(password, &salt);
    let Ok(cipher) = Aes256Gcm::new_from_slice(&key) else {
        return false;
    };
    if iv.len() != IV_LEN {
        return false;
    }
    let nonce = Nonce::from_slice(&iv);
    match cipher.decrypt(nonce, proof.as_ref()) {
        Ok(plain) => plain == VERIFY_CHALLENGE,
        Err(_) => false,
    }
}

pub fn encrypt_content_json(password: &str, content_json: &str) -> Result<String, String> {
    let salt = random_bytes(SALT_LEN);
    let iv = random_bytes(IV_LEN);
    let key = derive_key(password, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&iv);
    let sealed = cipher
        .encrypt(nonce, content_json.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "type": VAULT_MARKER,
        "salt": B64.encode(salt),
        "iv": B64.encode(iv),
        "ct": B64.encode(sealed),
    })
    .to_string())
}

pub fn decrypt_content_json(password: &str, cipher_json: &str) -> Result<String, String> {
    let payload: Value =
        serde_json::from_str(cipher_json).map_err(|e| format!("Invalid vault JSON: {e}"))?;
    if payload.get("type").and_then(Value::as_str) != Some(VAULT_MARKER) {
        return Err("Not a vault payload".to_string());
    }
    let salt = decode_b64(payload.get("salt").and_then(Value::as_str))?;
    let iv = decode_b64(payload.get("iv").and_then(Value::as_str))?;
    let ct = decode_b64(payload.get("ct").and_then(Value::as_str))?;
    if iv.len() != IV_LEN {
        return Err("Invalid vault IV".to_string());
    }
    let key = derive_key(password, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&iv);
    let plain = cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| "Vault decrypt failed".to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

fn decode_b64(value: Option<&str>) -> Result<Vec<u8>, String> {
    let raw = value.ok_or_else(|| "Missing base64 field".to_string())?;
    B64.decode(raw).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_content_and_verifier() {
        let password = "correct horse battery";
        let verifier = create_vault_verifier(password).unwrap();
        assert!(verify_vault_password(password, &verifier));
        assert!(!verify_vault_password("wrong", &verifier));

        let sealed = encrypt_content_json(password, r#"{"type":"doc","content":[]}"#).unwrap();
        assert!(is_vault_cipher_json(&sealed));
        let plain = decrypt_content_json(password, &sealed).unwrap();
        assert!(plain.contains("\"doc\""));
        assert!(decrypt_content_json("wrong", &sealed).is_err());
    }
}

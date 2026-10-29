//! Best-effort LAN IP detection for QR / capture URLs.

pub fn detect_lan_ip() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        for iface in ["en0", "en1", "en2", "bridge0"] {
            if let Ok(output) = std::process::Command::new("ipconfig")
                .args(["getifaddr", iface])
                .output()
            {
                if output.status.success() {
                    let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !ip.is_empty() && ip.contains('.') {
                        return Some(ip);
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = ();
    }
    None
}

pub const DEFAULT_PORT: u16 = 17_847;
pub const INBOX_FOLDER_NAME: &str = "Inbox";

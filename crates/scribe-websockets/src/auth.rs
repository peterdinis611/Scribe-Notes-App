//! Hello / Origin helpers for the local WebSocket server.

use crate::messages::ServerMessage;
use crate::settings::WebsocketSettings;
use crate::traits::WebsocketTokenAuth;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthError {
    MissingToken,
    InvalidToken,
    OriginDenied,
    RateLimited,
}

impl AuthError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::MissingToken => "auth.missing_token",
            Self::InvalidToken => "auth.invalid_token",
            Self::OriginDenied => "auth.origin_denied",
            Self::RateLimited => "auth.rate_limited",
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            Self::MissingToken => "Token required",
            Self::InvalidToken => "Invalid or expired token",
            Self::OriginDenied => "Origin not allowed",
            Self::RateLimited => "Too many requests",
        }
    }

    pub fn to_server_message(&self) -> ServerMessage {
        ServerMessage::error(self.code(), self.message())
    }
}

pub fn validate_hello_token(
    settings: &WebsocketSettings,
    auth: &dyn WebsocketTokenAuth,
    token: Option<&str>,
) -> Result<(), AuthError> {
    if !settings.require_token {
        return Ok(());
    }
    let Some(raw) = token.map(str::trim).filter(|value| !value.is_empty()) else {
        return Err(AuthError::MissingToken);
    };
    if auth.is_valid(raw) {
        Ok(())
    } else {
        Err(AuthError::InvalidToken)
    }
}

pub fn origin_allowed(settings: &WebsocketSettings, origin: Option<&str>) -> bool {
    let Some(origin) = origin.map(str::trim).filter(|value| !value.is_empty()) else {
        // Native / non-browser clients often omit Origin.
        return true;
    };
    if settings.allowed_origins.is_empty() {
        return true;
    }
    settings
        .allowed_origins
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(origin))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::default_websocket_settings;

    struct AlwaysOk;
    impl WebsocketTokenAuth for AlwaysOk {
        fn is_valid(&self, _: &str) -> bool {
            true
        }
    }

    struct AlwaysDeny;
    impl WebsocketTokenAuth for AlwaysDeny {
        fn is_valid(&self, _: &str) -> bool {
            false
        }
    }

    #[test]
    fn require_token_enforced() {
        let settings = default_websocket_settings();
        assert!(matches!(
            validate_hello_token(&settings, &AlwaysOk, None),
            Err(AuthError::MissingToken)
        ));
        assert!(validate_hello_token(&settings, &AlwaysOk, Some("abc")).is_ok());
        assert!(matches!(
            validate_hello_token(&settings, &AlwaysDeny, Some("abc")),
            Err(AuthError::InvalidToken)
        ));
    }

    #[test]
    fn origin_allowlist() {
        let settings = default_websocket_settings();
        assert!(origin_allowed(&settings, None));
        assert!(origin_allowed(&settings, Some("tauri://localhost")));
        assert!(!origin_allowed(&settings, Some("https://evil.example")));
    }
}

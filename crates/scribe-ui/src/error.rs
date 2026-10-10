use thiserror::Error;

#[derive(Debug, Error)]
pub enum UiError {
    #[error("{0}")]
    Message(String),
}

impl From<UiError> for String {
    fn from(value: UiError) -> Self {
        value.to_string()
    }
}

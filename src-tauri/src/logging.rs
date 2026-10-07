#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        println!("[{}] [INFO] {}", chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true), format!($($arg)*))
    };
}

#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        eprintln!("[{}] [WARN] {}", chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true), format!($($arg)*))
    };
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {
        eprintln!("[{}] [ERROR] {}", chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true), format!($($arg)*))
    };
}

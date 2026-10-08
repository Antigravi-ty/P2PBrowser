pub mod config;
pub mod download;
pub mod host_relay;
pub mod logging;
pub mod models;
pub mod probe;
pub mod socks5;
pub mod system;
pub mod webview;

pub use config::{get_app_config_dir, load_app_config, open_app_config_folder, save_app_config};
pub use download::{cancel_download, open_download_file, show_in_folder, start_download};
pub use host_relay::{
    host_close_all_tcp_streams, host_close_tcp_stream, host_open_tcp_stream, host_send_tcp_data,
};
pub use probe::check_google_204;
pub use socks5::{
    client_socks5_ack, client_socks5_close_stream, client_socks5_recv_data, set_client_tunnel_mode,
    start_socks5_proxy,
};
pub use system::{get_system_info, open_devtools};
pub use webview::{
    clear_browsing_data, clear_cookies, clear_cache, close_tab_webview, create_tab_webview, go_back_tab_webview,
    go_forward_tab_webview, log_webview_console, navigate_tab_webview,
    open_new_tab_requested, reload_tab_webview, start_download_requested, tab_state_update,
};

pub fn run() {
    #[cfg(windows)]
    {
        // Globally bypass certificate verification for WebView2 instances without command line mismatch
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--ignore-certificate-errors");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_socks5_proxy,
            check_google_204,
            get_system_info,
            open_devtools,
            host_open_tcp_stream,
            host_send_tcp_data,
            host_close_tcp_stream,
            host_close_all_tcp_streams,
            set_client_tunnel_mode,
            client_socks5_ack,
            client_socks5_recv_data,
            client_socks5_close_stream,
            create_tab_webview,
            navigate_tab_webview,
            reload_tab_webview,
            go_back_tab_webview,
            go_forward_tab_webview,
            close_tab_webview,
            clear_browsing_data,
            clear_cookies,
            clear_cache,
            log_webview_console,
            tab_state_update,
            open_new_tab_requested,
            start_download_requested,
            start_download,
            cancel_download,
            open_download_file,
            show_in_folder,
            get_app_config_dir,
            open_app_config_folder,
            load_app_config,
            save_app_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

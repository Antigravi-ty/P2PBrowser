# P2PBrowser Agent Guidelines & Architecture Manual

## 1. Project Overview

P2PBrowser is a peer-to-peer proxied browser desktop application built on **Tauri v2**, **React 18**, and **TypeScript**. It enables cross-network web browsing by creating a direct WebRTC DataChannel tunnel between a Host (acting as an exit node / relay) and a Client (browsing via local SOCKS5 proxy routed through the Host).

---

## 2. Architecture & Modular Structure

To maintain high code quality, reduce coupling, and prevent context/attention degradation, all modules are kept small (< 100 KB, typically < 15 KB).

### 2.1 Backend (`src-tauri/src/`)

```
src-tauri/src/
├── lib.rs              # Tauri entrypoint, registers plugins and command handlers
├── main.rs             # Application binary main entrypoint
├── logging.rs          # Centralized ISO-8601 timestamp logging macros (log_info!, log_warn!, log_error!)
├── models.rs           # Shared serializable structs, IPC payloads, and responses
├── probe.rs            # Google 204 HTTP connectivity probe command (check_google_204)
├── system.rs           # OS and runtime platform inspection command (get_system_info)
├── socks5.rs           # SOCKS5 proxy server (RFC 1928), port probing, and client stream multiplexing
├── host_relay.rs       # Host-side native TCP streaming relay (bypassing browser CORS, routing via TUN/Surge)
└── webview/
    ├── mod.rs          # Webview tab lifecycle management (create, navigate, reload, close)
    └── tab_script.js   # Isolated webview JavaScript injection (URL/title sync, link hijacking, context menu)
```

**Key Backend Principles:**
- **No Embedded JS String Bloat**: Injected JavaScript must live in `webview/tab_script.js` and loaded via `include_str!`. Never embed raw JavaScript strings containing `#` hex codes or CSS in Rust `r#"..."#` raw string literals, as `"#` prematurely terminates the literal.
- **Port Probing & Cleanup**: The internal SOCKS5 server probes up to 100 ports starting from `10808` to avoid port contention, with graceful abortion of stale tasks.
- **Data Directory Isolation**: Each child tab webview is provisioned with an isolated `data_directory` (`webviews/<label>`) to prevent WebView2 error `0x8007139F`.

---

### 2.2 Frontend (`src/`)

```
src/
├── App.tsx                     # Top-level view coordinator (~250-300 lines)
├── components/
│   ├── BrowserView.tsx         # Tab display and web navigation portal
│   ├── ConfirmDialog.tsx       # Reusable double-check confirmation dialog
│   ├── DownloadPopover.tsx     # Active/completed download manager popup
│   ├── RoomModal.tsx           # Room connection and proxy settings modal
│   ├── ServerDashboard.tsx     # Host telemetry, peer list, and real-time event logs
│   ├── Sidebar.tsx             # Left-side navigation bar and vertical tab strip
│   └── TopBar.tsx              # URL omnibox, back/forward/reload, and Google probe badge
├── hooks/
│   ├── useTheme.ts             # Theme state ('light' | 'dark') and system synchronization
│   ├── useTabs.ts              # Browser tab state, navigation, and webview event synchronization
│   ├── useP2PTunnel.ts         # P2P WebRTC tunnel & WebSocket signaling lifecycle
│   ├── useGoogleProbe.ts       # 5-second Google 204 verification and bypass handling
│   ├── useDownloads.ts         # Download task subscription and management
│   ├── useHostRelayEvents.ts   # Tauri host TCP stream listeners (host-stream-data, host-stream-close)
│   └── useClientSocks5Events.ts# Tauri client SOCKS5 stream listeners and FIFO write ordering
├── network/
│   ├── ConnectivityProbe.ts    # Google connectivity probe helpers
│   ├── DownloadManager.ts      # Multi-task chunked download engine
│   ├── P2PWebRTCTunnel.ts      # WebRTC PeerConnection and multiplexed stream routing
│   ├── SignalingConfig.ts      # Room code generators and default WebSocket endpoints
│   ├── TabWebviewManager.ts    # Child webview layout coordinate calculator and bridge
│   └── WebSocketSignalingClient.ts # Resilient signaling client with auto-retry and race probes
├── store/
│   └── browserStore.ts         # Centralized Zustand store for tabs, navigation history stacks, and active tab
├── assets/
│   ├── fonts/                  # JetBrains Mono font files
│   └── shortcuts-svg/          # Standalone brand SVG icons (google.svg, github.svg, cloudflare.svg)
├── config/
│   ├── shortcuts.json          # Configurable home shortcuts (Lucide icons, svg:name, or text:XYZ)
│   ├── shortcuts.schema.json   # JSON schema for shortcuts.json validation
│   └── shortcutsPlugin.ts      # Vite plugin for build-time shortcuts validation and on-demand Lucide tree-shaking
├── types/
│   └── network.ts              # Core TypeScript type definitions and IPC interfaces
└── utils/
    ├── logger.ts               # Absolute ISO timestamp logging utility
    └── shortcuts.ts            # Shortcut icon name case normalizer
```


**Key Frontend Principles:**
- **Decoupled Hooks**: `App.tsx` only acts as a thin orchestrator. State changes in one module (e.g. tabs or theme) must not cascade side effects into tunnel or signaling logic.
- **FIFO Stream Ordering**: WebRTC data chunks forwarded between the native SOCKS5 proxy and the WebRTC DataChannel are queued sequentially via Promise chains (`streamWriteQueues`) to prevent TLS/HTTP2 handshake races.
- **Overlay Management**: When modals, popovers, or the host dashboard are visible, `TabWebviewManager.setOverlayOpen(true)` hides native child webviews to prevent z-index clipping.

---

## 3. Verification & Build Commands

Before committing or pushing any changes, always verify both backend and frontend builds:

```bash
# Verify Rust backend compilation
cd src-tauri
cargo check

# Verify TypeScript and Frontend Vite bundle
cd ..
npm run build
```

---

## 4. Agent Guidelines for Future Modifications

1. **File Size Limit**: Keep every single file under **100 KB**. If a file grows large, break it down into focused submodules or dedicated hooks.
2. **Component Decoupling**: Keep component props and hook interfaces minimal and well-typed. Avoid passing large god-objects.
3. **Preserve Compatibility**: When updating Tauri commands or IPC events, maintain backwards compatibility between Tauri `invoke()` and Rust handler names in `src-tauri/src/lib.rs`.

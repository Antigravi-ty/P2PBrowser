# P2P Browser

A lightweight, zero-privilege desktop proxy browser powered by **Tauri 2**, **WebRTC RTCDataChannel**, and **Primer React**.

## 🚀 Overview & Key Highlights

- **WebRTC P2P SOCKS5 Proxy**:
  - Direct peer-to-peer data tunnel across devices and NAT networks without relay servers.
  - Client connections are multiplexed over an ordered, reliable WebRTC DataChannel (`ordered: true`).
- **macOS Host with Surge Enhanced Mode Integration**:
  - The macOS machine acts as a background proxy server host.
  - When running Surge in **Enhanced Mode** (TUN virtual interface), all incoming WebRTC connections from clients are dispatched directly through the operating system network stack—Surge automatically intercepts, accelerates, routes, and applies MITM inspection with zero manual port configuration required.
  - Live Host Dashboard displays connected peers, ICE candidate transport types (TCP / UDP), round-trip latency, and real-time destination streams (e.g. `CONNECT google.com:443`).
- **Composite Room Key Pair Isolation**:
  - Signaling endpoint: `wss://unstable.test.breadguy.link/ws`
  - Fixed prefix: `TCPPROXYROOM10051132-`
  - Auto-generated or custom 4-digit room code with optional password.
  - Room and password form an isolated unique pair (`TCPPROXYROOM10051132-${roomId}__${password}`), completely preventing room collision or unauthorized probing.
- **Automated Google 204 Connectivity Probe**:
  - Pre-flight verification right after P2P tunnel establishment (`https://www.google.com/generate_204`).
  - Measures true end-to-end round-trip latency (RTT in ms) and verifies traffic flow before activating the full browser viewport.
- **In-App Silent Certificate Bypass (No System Root Store Modification)**:
  - WebView instances launch with `--ignore-certificate-errors`.
  - Zero administrator privileges required.
  - No changes to the OS root certificate store, ensuring a clean and secure host environment.
- **Single-Thread Download Engine**:
  - Integrated download drawer supporting direct URL downloads, progress tracking, transfer speed calculations, and disk persistence.
- **GitHub Primer UI Design**:
  - Left vertical sidebar with active tabs, tab close on hover (red danger highlight), and P2P connection badge.
  - Top navigation bar with Back, Forward, Reload, Home, HTTPS security indicator, Google status badge, and Downloads popover.

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Vite, `@primer/react`, `@primer/octicons-react`
- **Backend / Native**: Tauri 2, Rust, Tokio async runtime, SOCKS5 multiplexer
- **Networking**: WebSockets (`wss://unstable.test.breadguy.link/ws`), WebRTC (ICE-TCP, STUN)

## 📦 Getting Started

### Prerequisites

- Node.js (v18+) & npm / pnpm
- Rust (1.75+) and Cargo

### Development

```bash
# Install dependencies
npm install

# Start Vite frontend in development
npm run dev

# Launch full Tauri application
npm run tauri dev
```

### Production Build

```bash
# Compile frontend and native binaries
npm run build
npm run tauri build
```

## 🔒 Security & Privacy

1. **P2P Encrypted**: All traffic traveling over the WebRTC DataChannel is end-to-end encrypted via DTLS/SCTP.
2. **Zero Inbound Ports on Host**: The host does not open any external listening ports to the public internet, preventing port scanning.
3. **Isolated Pair Rooms**: Room codes paired with passwords create separate namespaces on the signaling server.

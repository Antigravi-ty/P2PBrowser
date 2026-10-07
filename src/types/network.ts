/**
 * src/types/network.ts
 * Type definitions for P2P WebRTC Proxy, Streams, Downloads, and Navigation Tabs.
 */

export type AppRole = 'client' | 'host';

export type TunnelState = 
  | 'idle' 
  | 'signaling' 
  | 'ice_gathering' 
  | 'p2p_connected' 
  | 'probing_google' 
  | 'ready' 
  | 'error' 
  | 'closed';

export interface RoomConnectionConfig {
  signalingUrl: string;
  roomId: string;
  password?: string;
  role: AppRole;
  clientName?: string;
  preferredTransport?: 'auto' | 'udp' | 'tcp';
  socks5Port?: number;
}

export interface GoogleProbeResult {
  success: boolean;
  status: number;
  latencyMs: number;
  checkedAt: number;
  message: string;
}

export interface PeerInfo {
  peerId: string;
  name: string;
  role: AppRole;
  connectedAt: number;
  transportType: string; // 'udp' | 'tcp' | 'host' | 'srflx'
  rttMs: number;
  bytesUploaded: number;
  bytesDownloaded: number;
  activeStreamsCount: number;
  logCaptureEnabled?: boolean;
  syncedConfigId?: string | null;
  lastSyncAt?: string | null;
  bufferedLogsCount?: number;
}

export interface ActiveStreamInfo {
  streamId: number;
  targetHost: string;
  targetPort: number;
  protocol: 'HTTP' | 'HTTPS' | 'TCP' | 'SOCKS5';
  bytesSent: number;
  bytesReceived: number;
  status: 'connecting' | 'open' | 'closing' | 'closed' | 'error';
  createdAt: number;
  durationMs: number;
}

export interface ServerTelemetry {
  activeClients: PeerInfo[];
  activeStreams: ActiveStreamInfo[];
  totalBytesUp: number;
  totalBytesDown: number;
  speedUpBps: number;
  speedDownBps: number;
  surgeEnhancedModeDetected: boolean;
  isSignalingConnected?: boolean;
}

export interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  destination?: string;
  totalBytes: number;
  receivedBytes: number;
  speedBytesPerSec: number;
  progressPercent: number;
  status: 'pending' | 'downloading' | 'completed' | 'paused' | 'failed';
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isSecured: boolean;
}

export interface EventLogItem {
  id: string;
  time: string;
  level: 'info' | 'warn' | 'error';
  text: string;
}

export interface HostStreamDataPayload {
  streamId?: number;
  stream_id?: number;
  data: number[];
}

export interface HostStreamClosePayload {
  streamId?: number;
  stream_id?: number;
  error?: string | null;
}

export interface ClientSocks5OpenPayload {
  streamId?: number;
  stream_id?: number;
  host: string;
  port: number;
}

export interface ClientSocks5DataPayload {
  streamId?: number;
  stream_id?: number;
  data: number[];
}

export interface ClientSocks5ClosePayload {
  streamId?: number;
  stream_id?: number;
  error?: string | null;
}

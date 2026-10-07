/**
 * src/network/P2PWebRTCTunnel.ts
 * Manages WebRTC PeerConnection, ICE negotiation, and Multiplexed Stream Tunneling.
 * Supports multi-client incoming peers on Host, individual peer disconnection,
 * buffered trickle ICE candidate handling, automatic retry recovery,
 * and independent WebSocket Token Server lifecycle management.
 */

import { WebSocketSignalingClient } from './WebSocketSignalingClient';
import { ActiveStreamInfo, PeerInfo, ServerTelemetry, TunnelState } from '../types/network';
import { getBufferedLogs, appendRemoteLog, getLogFilterConfig } from '../utils/logger';

export const FRAME_TYPE = {
  OPEN: 1,
  DATA: 2,
  CLOSE: 3,
  ACK: 4,
  PING: 5,
  PONG: 6,
  ERROR: 7,
  LOG_SYNC: 8,
  LOG_REQUEST: 9,
  LOG_CONFIG_PUSH: 10,
  LOG_CONFIG_ACK: 11,
} as const;

export interface StreamListener {
  onData?: (data: Uint8Array) => void;
  onClose?: () => void;
  onError?: (err: string) => void;
  onAck?: (success: boolean, error?: string) => void;
}

interface HostPeer {
  peerId: string;
  name: string;
  pc: RTCPeerConnection | null;
  dc: RTCDataChannel | null;
  connectedAt: number;
  transportType: string;
  rttMs: number;
  bytesUploaded: number;
  bytesDownloaded: number;
  heartbeatTimer?: any;
  logCaptureEnabled?: boolean;
  syncedConfigId?: string | null;
  lastSyncAt?: string | null;
  bufferedLogsCount?: number;
}

interface HostStreamRoute {
  peerId: string;
  remoteStreamId: number;
  dc: RTCDataChannel;
}

export class P2PWebRTCTunnel {
  private role: 'host' | 'client';
  private signaling: WebSocketSignalingClient;
  private state: TunnelState = 'idle';

  // Client-specific peer state
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private remotePeerId: string | null = null;
  private heartbeatTimer: any = null;
  private clientPendingCandidates: RTCIceCandidateInit[] = [];
  private clientRetryCount = 0;
  private clientOfferTimeoutTimer: any = null;
  private clientIceCheckingTimer: any = null;
  private clientDisconnectedTimer: any = null;

  // Host-specific multi-peer state
  private hostPeers: Map<string, HostPeer> = new Map();
  private hostConnectingPeers: Set<string> = new Set();
  private hostPendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private nextServerStreamId: number = 1;
  private streamToHostRoute: Map<number, HostStreamRoute> = new Map();
  private peerRemoteToHostStream: Map<string, number> = new Map();

  // Streams & Telemetry
  private streamListeners: Map<number, StreamListener> = new Map();
  private nextStreamId: number = 1;
  private activeStreams: Map<number, ActiveStreamInfo> = new Map();
  private totalBytesUp = 0;
  private totalBytesDown = 0;
  private rttMs = 0;
  private connectedAt = 0;
  private transportType = 'auto';

  // Event callbacks
  public onStateChange?: (state: TunnelState, message?: string) => void;
  public onTelemetryUpdate?: (telemetry: ServerTelemetry) => void;
  public onServerStreamRequested?: (
    streamId: number,
    host: string,
    port: number,
    tunnel: P2PWebRTCTunnel
  ) => void;
  public onLogEntry?: (entry: {
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    category: string;
    message: string;
    details?: any;
  }) => void;
  public onRemoteLog?: (entry: {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug' | 'log';
    message: string;
    peerId: string;
  }) => void;

  // Remote log sync configurations
  private requireClientLogs: boolean = true;
  private activeLogConfigId: string = 'cfg_default';
  private clientRemoteLogCaptureEnabled: boolean = true;
  private clientActiveLogConfigId: string = 'cfg_default';

  constructor(signaling: WebSocketSignalingClient, role: 'host' | 'client') {
    this.signaling = signaling;
    this.role = role;
    this.setupSignalingListeners();
  }

  public getState(): TunnelState {
    return this.state;
  }

  public getRtt(): number {
    return this.rttMs;
  }

  public getTransportType(): string {
    return this.transportType;
  }

  public isSignalingConnected(): boolean {
    return this.signaling.isSignalingConnected();
  }

  private log(level: 'info' | 'warn' | 'error', category: string, message: string, details?: any) {
    const fullMsg = `[P2PWebRTCTunnel][${category}] ${message}`;
    if (level === 'error') {
      console.error(fullMsg, details !== undefined ? details : '');
    } else if (level === 'warn') {
      console.warn(fullMsg, details !== undefined ? details : '');
    } else {
      console.log(fullMsg, details !== undefined ? details : '');
    }

    if (this.onLogEntry) {
      this.onLogEntry({
        timestamp: Date.now(),
        level,
        category,
        message,
        details,
      });
    }
  }

  private setState(newState: TunnelState, message?: string) {
    this.state = newState;
    if (this.onStateChange) {
      this.onStateChange(newState, message);
    }
  }

  private clearClientHandshakeTimers(): void {
    if (this.clientOfferTimeoutTimer) {
      clearTimeout(this.clientOfferTimeoutTimer);
      this.clientOfferTimeoutTimer = null;
    }
    if (this.clientIceCheckingTimer) {
      clearTimeout(this.clientIceCheckingTimer);
      this.clientIceCheckingTimer = null;
    }
    if (this.clientDisconnectedTimer) {
      clearTimeout(this.clientDisconnectedTimer);
      this.clientDisconnectedTimer = null;
    }
  }

  private startClientOfferTimeout(): void {
    if (this.role !== 'client') return;
    if (this.clientOfferTimeoutTimer) clearTimeout(this.clientOfferTimeoutTimer);
    this.clientOfferTimeoutTimer = setTimeout(() => {
      if ((this.state === 'signaling' || this.state === 'idle') && this.remotePeerId && (!this.dataChannel || this.dataChannel.readyState !== 'open')) {
        console.warn(`[P2PWebRTCTunnel] 6s elapsed without SDP offer from host #${this.remotePeerId}. Proactively requesting offer.`);
        if (this.signaling.isSignalingConnected()) {
          this.signaling.send({
            type: 'request_offer',
            targetPeerId: this.remotePeerId,
            fromPeerId: this.signaling.getPeerId(),
          });
        }
        this.clientOfferTimeoutTimer = setTimeout(() => {
          if ((this.state === 'signaling' || this.state === 'idle') && (!this.dataChannel || this.dataChannel.readyState !== 'open')) {
            console.error(`[P2PWebRTCTunnel] Handshake timeout waiting for host #${this.remotePeerId} offer.`);
            this.handleIceFailure('Handshake timeout waiting for host offer (14s)');
          }
        }, 8000);
      }
    }, 6000);
  }

  private startClientIceCheckingTimeout(): void {
    if (this.role !== 'client') return;
    if (this.clientIceCheckingTimer) clearTimeout(this.clientIceCheckingTimer);
    this.clientIceCheckingTimer = setTimeout(() => {
      if (
        this.pc &&
        (this.pc.iceConnectionState === 'checking' || this.pc.iceConnectionState === 'new') &&
        (!this.dataChannel || this.dataChannel.readyState !== 'open')
      ) {
        console.error('[P2PWebRTCTunnel] ICE checking timeout after 12s.');
        this.handleIceFailure('ICE connection checking timeout (12s)');
      }
    }, 12000);
  }

  private setupSignalingListeners() {
    this.signaling.onProgress = (msg: string) => {
      this.setState('signaling', msg);
    };

    this.signaling.on('open', () => {
      console.log('[P2PWebRTCTunnel] Signaling WebSocket connection established.');
      this.setState('signaling', 'Signaling channel connected. Joining room...');
      this.emitTelemetry();
    });

    this.signaling.on('close', () => {
      console.log('[P2PWebRTCTunnel] Signaling WebSocket connection closed.');
      this.emitTelemetry();
    });

    this.signaling.on('host_ready', (data) => {
      console.log('[P2PWebRTCTunnel] Host ready on signaling room:', data.roomId);
      this.setState('signaling', 'Host listening in room. Waiting for clients...');
      this.emitTelemetry();
    });

    this.signaling.on('joined_room', (data) => {
      console.log('[P2PWebRTCTunnel] Client joined room:', data.roomId);
      this.setState('signaling', 'Joined room. Initializing WebRTC handshake...');
      this.emitTelemetry();
    });

    // Handle room info sent upon initial room connection
    this.signaling.on('room_info', async (data) => {
      console.log('[P2PWebRTCTunnel] Room info received:', data);
      const myPeerId = this.signaling.getPeerId();
      const participants: Array<{ peerId: string; peerName?: string }> = data.participants || [];

      if (this.role === 'host') {
        if (this.state === 'idle') {
          this.setState('signaling', 'Host listening in room. Waiting for clients...');
        }
        for (const p of participants) {
          if (p.peerId && p.peerId !== myPeerId && !this.hostPeers.has(p.peerId)) {
            console.log(`[P2PWebRTCTunnel] Discovered existing client in room #${p.peerId}. Initiating WebRTC offer.`);
            await this.initiateHostPeerConnection(p.peerId);
          }
        }
      } else if (this.role === 'client') {
        if (this.state === 'idle') {
          this.setState('signaling', 'Joined room. Initializing WebRTC handshake...');
        }
        const hostPeer = participants.find((p) => p.peerId && p.peerId !== myPeerId);
        if (hostPeer && !this.remotePeerId) {
          this.remotePeerId = hostPeer.peerId;
          console.log(`[P2PWebRTCTunnel] Client discovered host in room: #${hostPeer.peerId}`);
          this.startClientOfferTimeout();
        }
      }
      this.emitTelemetry();
    });

    this.signaling.on('peer_joined', async (data) => {
      const myPeerId = this.signaling.getPeerId();
      if (!data.peerId || data.peerId === myPeerId) {
        return; // Filter out self peer_joined event
      }

      console.log('[P2PWebRTCTunnel] Remote peer joined:', data.peerId);
      if (this.role === 'host') {
        // Host initiates WebRTC Offer to this specific client
        await this.initiateHostPeerConnection(data.peerId);
      } else {
        this.remotePeerId = data.peerId;
        this.startClientOfferTimeout();
      }
    });

    this.signaling.on('offer', async (data) => {
      const myPeerId = this.signaling.getPeerId();
      const fromPeer = data.fromPeerId || data.peerId || data.senderId || 'host';
      if (fromPeer === myPeerId) return;

      console.log('[P2PWebRTCTunnel] Received SDP offer from:', fromPeer);
      this.remotePeerId = fromPeer;
      if (this.role === 'client') {
        this.clearClientHandshakeTimers();
        this.startClientIceCheckingTimeout();
        await this.initiateClientPeerConnection(fromPeer);
        if (this.pc) {
          try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            // Drain any ICE candidates received prior to remoteDescription being ready
            await this.drainClientPendingCandidates();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            this.signaling.sendAnswer(answer, fromPeer);
          } catch (err: any) {
            console.error('[P2PWebRTCTunnel] Error handling offer:', err);
            this.handleIceFailure(`Offer SDP error: ${err?.message || err}`);
          }
        }
      }
    });

    this.signaling.on('peer_disconnected', (data) => {
      const fromPeer = data.fromPeerId || data.peerId;
      if (this.role === 'client' && fromPeer === this.remotePeerId) {
        console.warn(`[P2PWebRTCTunnel] Host #${fromPeer} notified disconnection: ${data.reason || 'Closed'}`);
        this.handleIceFailure(`Host terminated session: ${data.reason || 'Closed by host'}`);
      }
    });

    this.signaling.on('answer', async (data) => {
      const myPeerId = this.signaling.getPeerId();
      const fromPeer = data.fromPeerId || data.peerId || data.senderId;
      if (fromPeer === myPeerId) return;

      console.log('[P2PWebRTCTunnel] Received SDP answer from:', fromPeer);
      if (this.role === 'host') {
        const peer = fromPeer ? this.hostPeers.get(fromPeer) : Array.from(this.hostPeers.values())[0];
        if (peer && peer.pc) {
          try {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const targetKey = fromPeer || peer.peerId;
            await this.drainHostPendingCandidates(targetKey, peer.pc);
            if (this.hostPendingCandidates.has('default')) {
              await this.drainHostPendingCandidates('default', peer.pc);
            }
          } catch (e) {
            console.error(`[P2PWebRTCTunnel] Host error setting remote description for client #${fromPeer}:`, e);
          }
        }
      } else if (this.pc) {
        try {
          await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await this.drainClientPendingCandidates();
        } catch (e) {
          console.error('[P2PWebRTCTunnel] Client error setting remote description for answer:', e);
        }
      }
    });

    this.signaling.on('candidate', async (data) => {
      const myPeerId = this.signaling.getPeerId();
      const fromPeer = data.fromPeerId || data.peerId || data.senderId;
      if (!data.candidate || fromPeer === myPeerId) return;

      if (this.role === 'host') {
        const peer = fromPeer ? this.hostPeers.get(fromPeer) : Array.from(this.hostPeers.values())[0];
        if (peer && peer.pc && peer.pc.remoteDescription && peer.pc.remoteDescription.type) {
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.warn('[P2PWebRTCTunnel] Host error adding ICE candidate:', e);
          }
        } else {
          // Buffer candidate until answer's remoteDescription is applied
          const targetKey = fromPeer || (peer ? peer.peerId : 'default');
          const list = this.hostPendingCandidates.get(targetKey) || [];
          list.push(data.candidate);
          this.hostPendingCandidates.set(targetKey, list);
        }
      } else if (this.role === 'client') {
        if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.warn('[P2PWebRTCTunnel] Client error adding ICE candidate:', e);
          }
        } else {
          // Buffer candidate until offer's remoteDescription is applied
          this.clientPendingCandidates.push(data.candidate);
        }
      }
    });

    // Client requested fresh offer (e.g. renegotiation after ICE failure)
    this.signaling.on('request_offer', async (data) => {
      const myPeerId = this.signaling.getPeerId();
      const fromPeer = data.fromPeerId || data.peerId || data.senderId;
      if (!fromPeer || fromPeer === myPeerId) return;

      if (this.role === 'host') {
        console.log(`[P2PWebRTCTunnel] Received renegotiation request_offer from client #${fromPeer}. Reinitiating handshake.`);
        this.disconnectPeer(fromPeer);
        await this.initiateHostPeerConnection(fromPeer);
      }
    });

    this.signaling.on('peer_left', (data) => {
      const myPeerId = this.signaling.getPeerId();
      if (!data.peerId || data.peerId === myPeerId) return;

      console.log('[P2PWebRTCTunnel] Peer left:', data.peerId);
      if (this.role === 'host') {
        this.disconnectPeer(data.peerId);
      } else if (data.peerId === this.remotePeerId) {
        this.closePeer();
        this.setState('closed', 'Remote peer disconnected.');
      }
    });

    this.signaling.on('host_disconnected', () => {
      console.log('[P2PWebRTCTunnel] Host disconnected');
      if (this.role === 'client') {
        this.closePeer();
        this.setState('error', 'Host disconnected from room.');
      }
    });

    this.signaling.on('error', (err) => {
      console.error('[P2PWebRTCTunnel] Signaling error:', err);
      if (this.state !== 'ready' && this.state !== 'p2p_connected') {
        this.setState('error', typeof err === 'string' ? err : err?.message || 'Signaling error');
      }
    });

    this.signaling.on('close', () => {
      this.emitTelemetry();
    });
  }

  // -------------------------------------------------------------
  // Host Multi-Client Management
  // -------------------------------------------------------------
  private async initiateHostPeerConnection(targetPeerId: string) {
    if (this.hostConnectingPeers.has(targetPeerId)) {
      console.log(`[P2PWebRTCTunnel] Host connection to client #${targetPeerId} already in progress.`);
      return;
    }
    this.hostConnectingPeers.add(targetPeerId);

    try {
      if (this.hostPeers.has(targetPeerId)) {
        this.disconnectPeer(targetPeerId);
      }

      console.log(`[P2PWebRTCTunnel] Host initiating connection to client #${targetPeerId}`);

      const config: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.services.mozilla.com:3478' },
        ],
        iceCandidatePoolSize: 0,
      };

      const pc = new RTCPeerConnection(config);
      const hostPeer: HostPeer = {
        peerId: targetPeerId,
        name: `Client #${targetPeerId.slice(0, 6)}`,
        pc,
        dc: null,
        connectedAt: Date.now(),
        transportType: 'auto',
        rttMs: 0,
        bytesUploaded: 0,
        bytesDownloaded: 0,
      };
      this.hostPeers.set(targetPeerId, hostPeer);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candStr = event.candidate.candidate;
          if (candStr.includes('tcp') || candStr.includes('TCP')) {
            hostPeer.transportType = 'TCP';
          } else if (candStr.includes('typ host')) {
            hostPeer.transportType = 'Direct (LAN)';
          } else if (candStr.includes('typ srflx')) {
            hostPeer.transportType = 'Direct (P2P STUN)';
          }

          this.signaling.sendCandidate(targetPeerId, event.candidate.toJSON());
        }
      };

      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        console.log(`[P2PWebRTCTunnel] Host ICE state for client #${targetPeerId}:`, iceState);
        if (iceState === 'connected' || iceState === 'completed') {
          hostPeer.connectedAt = Date.now();
          this.emitTelemetry();
        } else if (iceState === 'disconnected') {
          console.warn(`[P2PWebRTCTunnel] Host ICE state for client #${targetPeerId} is disconnected (transient).`);
        } else if (iceState === 'failed') {
          console.warn(`[P2PWebRTCTunnel] Host ICE state for client #${targetPeerId} failed. Disconnecting peer.`);
          this.disconnectPeer(targetPeerId);
        }
      };

      const dc = pc.createDataChannel('p2p_proxy_stream', { ordered: true });
      hostPeer.dc = dc;
      this.setupHostDataChannel(targetPeerId, dc, hostPeer);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signaling.sendOffer(targetPeerId, offer);
    } catch (e) {
      console.error(`[P2PWebRTCTunnel] Error creating offer for client #${targetPeerId}:`, e);
      this.disconnectPeer(targetPeerId);
    } finally {
      this.hostConnectingPeers.delete(targetPeerId);
    }
  }

  private async drainHostPendingCandidates(targetKey: string, pc: RTCPeerConnection): Promise<void> {
    const list = this.hostPendingCandidates.get(targetKey);
    if (!list || list.length === 0) return;
    while (list.length > 0) {
      const candidates = list.splice(0, list.length);
      console.log(`[P2PWebRTCTunnel] Applying ${candidates.length} buffered ICE candidate(s) on host for peer #${targetKey}.`);
      for (const cand of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn(`[P2PWebRTCTunnel] Error adding buffered ICE candidate on host for peer #${targetKey}:`, e);
        }
      }
    }
    this.hostPendingCandidates.delete(targetKey);
  }

  private setupHostDataChannel(peerId: string, dc: RTCDataChannel, peer: HostPeer) {
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      console.log(`[P2PWebRTCTunnel] Host DataChannel OPEN for client #${peerId}!`);
      this.setState('p2p_connected', `Connected to client #${peerId}`);
      this.startHostPeerHeartbeat(peer);
      this.emitTelemetry();
      if (this.requireClientLogs) {
        setTimeout(() => {
          this.pushLogConfigToPeer(peerId, true);
        }, 150);
      }
    };

    dc.onclose = () => {
      console.log(`[P2PWebRTCTunnel] Host DataChannel CLOSED for client #${peerId}`);
      this.disconnectPeer(peerId);
    };

    dc.onerror = (err) => {
      console.error(`[P2PWebRTCTunnel] Host DataChannel Error for client #${peerId}:`, err);
    };

    dc.onmessage = (ev) => {
      this.handleHostIncomingFrame(peerId, dc, ev.data);
    };
  }

  private handleHostIncomingFrame(peerId: string, dc: RTCDataChannel, data: any) {
    const peer = this.hostPeers.get(peerId);

    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === FRAME_TYPE.PING) {
          if (dc.readyState === 'open') {
            dc.send(JSON.stringify({ type: FRAME_TYPE.PONG, time: msg.time }));
          }
        } else if (msg.type === FRAME_TYPE.PONG) {
          if (peer) {
            peer.rttMs = Math.max(1, Date.now() - msg.time);
            this.emitTelemetry();
          }
        } else if (msg.type === FRAME_TYPE.OPEN) {
          const clientStreamId = msg.streamId;
          const key = `${peerId}_${clientStreamId}`;
          if (this.peerRemoteToHostStream.has(key)) {
            console.warn(`[P2PWebRTCTunnel] Duplicate OPEN frame received from client #${peerId} for stream #${clientStreamId}, ignoring.`);
            return;
          }
          const hostStreamId = this.nextServerStreamId++;

          this.streamToHostRoute.set(hostStreamId, {
            peerId,
            remoteStreamId: clientStreamId,
            dc,
          });
          this.peerRemoteToHostStream.set(key, hostStreamId);

          this.handleRemoteStreamOpen(hostStreamId, msg.host, msg.port);
        } else if (msg.type === FRAME_TYPE.CLOSE) {
          const clientStreamId = msg.streamId;
          const key = `${peerId}_${clientStreamId}`;
          const hostStreamId = this.peerRemoteToHostStream.get(key);
          if (hostStreamId !== undefined) {
            this.handleRemoteStreamClose(hostStreamId);
            this.peerRemoteToHostStream.delete(key);
            this.streamToHostRoute.delete(hostStreamId);
          }
        } else if (msg.type === FRAME_TYPE.LOG_CONFIG_ACK) {
          if (peer) {
            peer.syncedConfigId = msg.configId;
            peer.lastSyncAt = msg.appliedAt || new Date().toISOString();
            peer.bufferedLogsCount = msg.bufferCount || 0;
            peer.logCaptureEnabled = true;
            this.emitTelemetry();
            const ackMsg = `[Host] Client #${peerId} confirmed log sync ID: ${msg.configId} (${msg.bufferCount || 0} logs ready)`;
            console.log(ackMsg);
            if (this.onRemoteLog) {
              this.onRemoteLog({
                timestamp: msg.appliedAt || new Date().toISOString(),
                level: 'info',
                message: ackMsg,
                peerId,
              });
            }
          }
        } else if (msg.type === FRAME_TYPE.LOG_SYNC) {
          if (Array.isArray(msg.logs)) {
            console.log(`[Host] Received ${msg.logs.length} diagnostic logs from client #${peerId} (with client timestamps)`);
            msg.logs.forEach((logItem: any) => {
              const formattedMsg = `[Client #${peerId}] ${logItem.message}`;
              const timestamp = logItem.timestamp || new Date().toISOString();
              appendRemoteLog({
                timestamp,
                level: logItem.level || 'info',
                category: logItem.category || 'others',
                message: formattedMsg,
                source: 'client',
              });
              if (this.onRemoteLog) {
                this.onRemoteLog({
                  timestamp,
                  level: logItem.level || 'info',
                  message: formattedMsg,
                  peerId,
                });
              }
            });
            if (peer) {
              peer.bufferedLogsCount = Math.max(0, (peer.bufferedLogsCount || 0) - msg.logs.length);
              this.emitTelemetry();
            }
          }
        }
      } catch (e) {
        console.warn('[P2PWebRTCTunnel] Malformed JSON frame from client:', e);
      }
      return;
    }

    if (data instanceof ArrayBuffer) {
      if (data.byteLength < 4) return;
      const view = new DataView(data);
      const clientStreamId = view.getUint32(0, false);
      const payload = new Uint8Array(data, 4);

      if (peer) {
        peer.bytesDownloaded += payload.byteLength;
      }
      this.totalBytesDown += payload.byteLength;

      const key = `${peerId}_${clientStreamId}`;
      const hostStreamId = this.peerRemoteToHostStream.get(key);
      if (hostStreamId !== undefined) {
        const stream = this.activeStreams.get(hostStreamId);
        if (stream) {
          stream.bytesReceived += payload.byteLength;
          stream.durationMs = Date.now() - stream.createdAt;
        }

        const listener = this.streamListeners.get(hostStreamId);
        if (listener && listener.onData) {
          listener.onData(payload);
        }
      }
      this.emitTelemetry();
    }
  }

  private startHostPeerHeartbeat(peer: HostPeer) {
    if (peer.heartbeatTimer) clearInterval(peer.heartbeatTimer);
    peer.heartbeatTimer = setInterval(() => {
      if (peer.dc && peer.dc.readyState === 'open') {
        try {
          peer.dc.send(JSON.stringify({ type: FRAME_TYPE.PING, time: Date.now() }));
        } catch (_) {}
      } else {
        clearInterval(peer.heartbeatTimer);
      }
    }, 2000);
  }

  /**
   * Disconnects a specific client peer while keeping server and other peers running
   */
  public disconnectPeer(peerId: string): void {
    this.hostConnectingPeers.delete(peerId);
    this.hostPendingCandidates.delete(peerId);

    // Notify the client peer over signaling that session has been disconnected
    if (this.signaling.isSignalingConnected()) {
      try {
        this.signaling.send({
          type: 'peer_disconnected',
          targetPeerId: peerId,
          fromPeerId: this.signaling.getPeerId(),
          reason: 'Host closed peer session',
        });
      } catch (_) {}
    }

    const peer = this.hostPeers.get(peerId);
    if (!peer) return;

    // Immediately remove from map to prevent re-entrant loops if dc.close() triggers onclose
    this.hostPeers.delete(peerId);

    console.log(`[P2PWebRTCTunnel] Disconnecting client peer #${peerId}`);
    if (peer.heartbeatTimer) {
      clearInterval(peer.heartbeatTimer);
      peer.heartbeatTimer = undefined;
    }
    if (peer.dc) {
      const dc = peer.dc;
      peer.dc = null;
      dc.onopen = null;
      dc.onclose = null;
      dc.onerror = null;
      dc.onmessage = null;
      try {
        dc.close();
      } catch (_) {}
    }
    if (peer.pc) {
      const pc = peer.pc;
      peer.pc = null;
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.ondatachannel = null;
      try {
        pc.close();
      } catch (_) {}
    }

    // Clean up streams for this peer
    for (const [hostStreamId, route] of this.streamToHostRoute.entries()) {
      if (route.peerId === peerId) {
        this.activeStreams.delete(hostStreamId);
        this.streamListeners.delete(hostStreamId);
        this.streamToHostRoute.delete(hostStreamId);
        this.peerRemoteToHostStream.delete(`${peerId}_${route.remoteStreamId}`);
      }
    }

    this.emitTelemetry();
    if (this.hostPeers.size === 0 && this.role === 'host') {
      this.setState('signaling', 'Host listening in room. Waiting for clients...');
    }
  }

  /**
   * Disconnects WebSocket Token Server (stops new peers) while maintaining all active P2P peers
   */
  public disconnectSignaling(): void {
    console.log('[P2PWebRTCTunnel] Disconnecting WebSocket Token Server; preserving active P2P peers.');
    this.signaling.close();
    this.emitTelemetry();
  }

  /**
   * Reconnects to WebSocket Token Server to resume accepting incoming peers
   */
  public async reconnectSignaling(): Promise<void> {
    console.log('[P2PWebRTCTunnel] Reconnecting to WebSocket Token Server...');
    await this.signaling.connect();
    this.emitTelemetry();
  }

  // -------------------------------------------------------------
  // Client Peer Management
  // -------------------------------------------------------------
  private async initiateClientPeerConnection(targetPeerId: string) {
    this.setState('ice_gathering', 'Gathering ICE candidates (STUN / TCP candidates)...');

    if (this.pc) {
      try {
        this.pc.close();
      } catch (_) {}
      this.pc = null;
    }
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (_) {}
      this.dataChannel = null;
    }

    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.services.mozilla.com:3478' },
      ],
      iceCandidatePoolSize: 0,
    };

    this.pc = new RTCPeerConnection(config);

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candStr = event.candidate.candidate;
        if (candStr.includes('tcp') || candStr.includes('TCP')) {
          this.transportType = 'TCP';
        } else if (candStr.includes('typ host')) {
          this.transportType = 'Direct (LAN)';
        } else if (candStr.includes('typ srflx')) {
          this.transportType = 'Direct (P2P STUN)';
        }

        const destPeer = this.remotePeerId || targetPeerId;
        this.signaling.sendCandidate(destPeer, event.candidate.toJSON());
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState;
      console.log('[P2PWebRTCTunnel] Client ICE Connection State:', state);
      if (state === 'connected' || state === 'completed') {
        this.connectedAt = Date.now();
        this.clientRetryCount = 0;
        this.clearClientHandshakeTimers();
        this.startClientHeartbeat();
      } else if (state === 'disconnected') {
        const isHandshake = !this.connectedAt || !this.dataChannel || this.dataChannel.readyState !== 'open';
        const graceMs = isHandshake ? 3000 : 5000;
        console.warn(`[P2PWebRTCTunnel] Client ICE connection disconnected (stage: ${isHandshake ? 'handshake' : 'active'}, grace: ${graceMs}ms).`);
        if (this.clientDisconnectedTimer) clearTimeout(this.clientDisconnectedTimer);
        this.clientDisconnectedTimer = setTimeout(() => {
          if (this.pc && (this.pc.iceConnectionState === 'disconnected' || this.pc.iceConnectionState === 'failed')) {
            console.error(`[P2PWebRTCTunnel] Client ICE disconnected grace period (${graceMs}ms) expired.`);
            this.handleIceFailure(`ICE disconnected timeout (${graceMs}ms)`);
          }
        }, graceMs);
      } else if (state === 'failed') {
        this.clearClientHandshakeTimers();
        this.handleIceFailure('ICE connection failed');
      }
    };

    this.pc.ondatachannel = (ev) => {
      console.log('[P2PWebRTCTunnel] Received DataChannel from Host');
      this.setupClientDataChannel(ev.channel);
    };
  }

  private async drainClientPendingCandidates(): Promise<void> {
    if (!this.pc) return;
    while (this.clientPendingCandidates.length > 0) {
      const candidates = this.clientPendingCandidates.splice(0, this.clientPendingCandidates.length);
      console.log(`[P2PWebRTCTunnel] Applying ${candidates.length} buffered ICE candidate(s) on client.`);
      for (const cand of candidates) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('[P2PWebRTCTunnel] Error adding buffered ICE candidate on client:', e);
        }
      }
    }
  }

  private handleIceFailure(reason: string): void {
    if (this.role !== 'client') return;
    this.clearClientHandshakeTimers();

    if (this.clientRetryCount < 3) {
      this.clientRetryCount++;
      console.warn(
        `[P2PWebRTCTunnel] Client ICE failure (${reason}). Attempting auto-retry (${this.clientRetryCount}/3)...`
      );
      this.setState('ice_gathering', `ICE handshake retrying (${this.clientRetryCount}/3): ${reason}`);

      // Close existing client peer connection cleanly
      if (this.dataChannel) {
        try {
          this.dataChannel.close();
        } catch (_) {}
        this.dataChannel = null;
      }
      if (this.pc) {
        try {
          this.pc.close();
        } catch (_) {}
        this.pc = null;
      }
      this.clientPendingCandidates = [];

      // Request fresh offer from host via signaling
      if (this.remotePeerId && this.signaling.isSignalingConnected()) {
        console.log(`[P2PWebRTCTunnel] Requesting new WebRTC offer from host #${this.remotePeerId}`);
        this.signaling.send({
          type: 'request_offer',
          targetPeerId: this.remotePeerId,
          fromPeerId: this.signaling.getPeerId(),
        });
        this.startClientOfferTimeout();
      }
    } else {
      console.error(`[P2PWebRTCTunnel] Client ICE connection failed permanently after ${this.clientRetryCount} retries.`);
      this.setState('error', `${reason} (failed after ${this.clientRetryCount} retries). Please verify host connection.`);
    }
  }

  private setupClientDataChannel(dc: RTCDataChannel) {
    this.dataChannel = dc;
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      console.log('[P2PWebRTCTunnel] Client DataChannel OPEN! Ready for SOCKS5 / HTTP Proxying.');
      this.clearClientHandshakeTimers();
      this.setState('p2p_connected', 'WebRTC DataChannel connected.');
      this.clientRetryCount = 0;
      this.startClientHeartbeat();
    };

    dc.onclose = () => {
      console.log('[P2PWebRTCTunnel] Client DataChannel CLOSED.');
      this.setState('closed', 'Tunnel closed');
    };

    dc.onerror = (err) => {
      console.error('[P2PWebRTCTunnel] Client DataChannel Error:', err);
    };

    dc.onmessage = (ev) => {
      this.handleClientIncomingFrame(ev.data);
    };
  }

  private handleClientIncomingFrame(data: any) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === FRAME_TYPE.PING) {
          this.sendControlFrame({ type: FRAME_TYPE.PONG, time: msg.time });
        } else if (msg.type === FRAME_TYPE.PONG) {
          this.rttMs = Math.max(1, Date.now() - msg.time);
          this.emitTelemetry();
        } else if (msg.type === FRAME_TYPE.ACK) {
          const stream = this.activeStreams.get(msg.streamId);
          if (stream) {
            stream.status = msg.success ? 'open' : 'error';
            this.emitTelemetry();
          }
          const listener = this.streamListeners.get(msg.streamId);
          if (listener && listener.onAck) {
            listener.onAck(msg.success, msg.error);
          }
        } else if (msg.type === FRAME_TYPE.CLOSE) {
          this.handleRemoteStreamClose(msg.streamId);
        } else if (msg.type === FRAME_TYPE.LOG_CONFIG_PUSH) {
          const configId = msg.configId || `cfg_${Date.now()}`;
          const enabled = Boolean(msg.enabled);
          this.clientRemoteLogCaptureEnabled = enabled;
          this.clientActiveLogConfigId = configId;
          console.log(`[Client] Received remote diagnostic config push from host: ID=${configId}, enabled=${enabled}`);
          this.sendControlFrame({
            type: FRAME_TYPE.LOG_CONFIG_ACK,
            configId,
            appliedAt: new Date().toISOString(),
            status: 'applied',
            bufferCount: getBufferedLogs().length,
          });
        } else if (msg.type === FRAME_TYPE.LOG_REQUEST) {
          const limit = Math.min(msg.limit || 200, 1000);
          const buffered = getBufferedLogs().slice(-limit);
          this.sendControlFrame({
            type: FRAME_TYPE.LOG_SYNC,
            configId: this.clientActiveLogConfigId,
            logs: buffered.map((l) => ({
              timestamp: l.timestamp,
              level: l.level,
              category: l.category,
              message: l.message,
            })),
          });
        }
      } catch (e) {
        console.warn('[P2PWebRTCTunnel] Client malformed JSON frame:', e);
      }
      return;
    }

    if (data instanceof ArrayBuffer) {
      if (data.byteLength < 4) return;
      const view = new DataView(data);
      const streamId = view.getUint32(0, false);
      const payload = new Uint8Array(data, 4);

      this.totalBytesDown += payload.byteLength;

      const stream = this.activeStreams.get(streamId);
      if (stream) {
        stream.bytesReceived += payload.byteLength;
        stream.durationMs = Date.now() - stream.createdAt;
      }

      const listener = this.streamListeners.get(streamId);
      if (listener && listener.onData) {
        listener.onData(payload);
      }
      this.emitTelemetry();
    }
  }

  private startClientHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.sendControlFrame({ type: FRAME_TYPE.PING, time: Date.now() });
      } else {
        clearInterval(this.heartbeatTimer);
      }
    }, 2000);
  }

  // -------------------------------------------------------------
  // Stream Management (Unified)
  // -------------------------------------------------------------
  public registerStreamListener(streamId: number, listener: StreamListener): void {
    this.streamListeners.set(streamId, listener);
  }

  private handleRemoteStreamOpen(streamId: number, host: string, port: number) {
    console.log(`[P2PWebRTCTunnel] Inbound Stream #${streamId} -> ${host}:${port}`);
    const streamInfo: ActiveStreamInfo = {
      streamId,
      targetHost: host,
      targetPort: port,
      protocol: port === 443 ? 'HTTPS' : port === 80 ? 'HTTP' : 'TCP',
      bytesSent: 0,
      bytesReceived: 0,
      status: 'connecting',
      createdAt: Date.now(),
      durationMs: 0,
    };
    this.activeStreams.set(streamId, streamInfo);
    this.emitTelemetry();

    if (this.onServerStreamRequested) {
      this.onServerStreamRequested(streamId, host, port, this);
    } else {
      this.acknowledgeStream(streamId, true);
    }
  }

  private handleRemoteStreamClose(streamId: number) {
    const listener = this.streamListeners.get(streamId);
    if (listener && listener.onClose) {
      try {
        listener.onClose();
      } catch (err) {
        console.warn(`[P2PWebRTCTunnel] Error in onClose listener for stream #${streamId}:`, err);
      }
    }
    // Delay deletion by 1500ms so any queued or in-flight data chunks are not dropped
    setTimeout(() => {
      this.activeStreams.delete(streamId);
      this.streamListeners.delete(streamId);
      this.emitTelemetry();
    }, 1500);
  }

  public openStream(host: string, port: number, listener: StreamListener): number {
    const streamId = this.nextStreamId++;
    this.streamListeners.set(streamId, listener);

    const streamInfo: ActiveStreamInfo = {
      streamId,
      targetHost: host,
      targetPort: port,
      protocol: port === 443 ? 'HTTPS' : port === 80 ? 'HTTP' : 'TCP',
      bytesSent: 0,
      bytesReceived: 0,
      status: 'connecting',
      createdAt: Date.now(),
      durationMs: 0,
    };
    this.activeStreams.set(streamId, streamInfo);

    this.sendControlFrame({
      type: FRAME_TYPE.OPEN,
      streamId,
      host,
      port,
    });

    this.emitTelemetry();
    return streamId;
  }

  public openStreamWithCustomId(
    streamId: number,
    host: string,
    port: number,
    listener: StreamListener
  ): number {
    this.streamListeners.set(streamId, listener);

    const streamInfo: ActiveStreamInfo = {
      streamId,
      targetHost: host,
      targetPort: port,
      protocol: port === 443 ? 'HTTPS' : port === 80 ? 'HTTP' : 'TCP',
      bytesSent: 0,
      bytesReceived: 0,
      status: 'connecting',
      createdAt: Date.now(),
      durationMs: 0,
    };
    this.activeStreams.set(streamId, streamInfo);

    this.sendControlFrame({
      type: FRAME_TYPE.OPEN,
      streamId,
      host,
      port,
    });

    this.emitTelemetry();
    return streamId;
  }

  public sendStreamData(streamId: number, data: Uint8Array): void {
    const CHUNK_LIMIT = 16384;
    if (data.byteLength <= CHUNK_LIMIT) {
      this.sendSingleStreamChunk(streamId, data);
    } else {
      for (let offset = 0; offset < data.byteLength; offset += CHUNK_LIMIT) {
        const slice = data.subarray(offset, Math.min(offset + CHUNK_LIMIT, data.byteLength));
        this.sendSingleStreamChunk(streamId, slice);
      }
    }
  }

  private sendSingleStreamChunk(streamId: number, data: Uint8Array): void {
    if (this.role === 'host') {
      const route = this.streamToHostRoute.get(streamId);
      if (!route || !route.dc || route.dc.readyState !== 'open') return;

      const buffer = new Uint8Array(4 + data.byteLength);
      const view = new DataView(buffer.buffer);
      view.setUint32(0, route.remoteStreamId, false);
      buffer.set(data, 4);

      try {
        route.dc.send(buffer);
      } catch (err) {
        console.warn(`[P2PWebRTCTunnel] Error sending chunk on host stream #${streamId}:`, err);
        return;
      }

      const peer = this.hostPeers.get(route.peerId);
      if (peer) {
        peer.bytesUploaded += data.byteLength;
      }
      this.totalBytesUp += data.byteLength;
    } else {
      if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

      const buffer = new Uint8Array(4 + data.byteLength);
      const view = new DataView(buffer.buffer);
      view.setUint32(0, streamId, false);
      buffer.set(data, 4);

      try {
        this.dataChannel.send(buffer);
      } catch (err) {
        console.warn(`[P2PWebRTCTunnel] Error sending chunk on client stream #${streamId}:`, err);
        return;
      }
      this.totalBytesUp += data.byteLength;
    }

    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.bytesSent += data.byteLength;
      stream.durationMs = Date.now() - stream.createdAt;
    }
    this.emitTelemetry();
  }

  public closeStream(streamId: number): void {
    if (this.role === 'host') {
      const route = this.streamToHostRoute.get(streamId);
      if (route && route.dc && route.dc.readyState === 'open') {
        try {
          route.dc.send(JSON.stringify({ type: FRAME_TYPE.CLOSE, streamId: route.remoteStreamId }));
        } catch (_) {}
      }
      if (route) {
        this.peerRemoteToHostStream.delete(`${route.peerId}_${route.remoteStreamId}`);
      }
      this.streamToHostRoute.delete(streamId);
    } else {
      this.sendControlFrame({
        type: FRAME_TYPE.CLOSE,
        streamId,
      });
    }

    this.activeStreams.delete(streamId);
    this.streamListeners.delete(streamId);
    this.emitTelemetry();
  }

  public acknowledgeStream(streamId: number, success: boolean, error?: string): void {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.status = success ? 'open' : 'error';
    }

    if (this.role === 'host') {
      const route = this.streamToHostRoute.get(streamId);
      if (route && route.dc && route.dc.readyState === 'open') {
        try {
          route.dc.send(
            JSON.stringify({
              type: FRAME_TYPE.ACK,
              streamId: route.remoteStreamId,
              success,
              error,
            })
          );
        } catch (_) {}
      }
    } else {
      this.sendControlFrame({
        type: FRAME_TYPE.ACK,
        streamId,
        success,
        error,
      });
    }

    this.emitTelemetry();
  }

  private sendControlFrame(msg: any): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(msg));
    }
  }

  public emitTelemetry(): void {
    if (!this.onTelemetryUpdate) return;

    const peers: PeerInfo[] = [];

    if (this.role === 'host') {
      for (const peer of this.hostPeers.values()) {
        let streamsCount = 0;
        for (const r of this.streamToHostRoute.values()) {
          if (r.peerId === peer.peerId) streamsCount++;
        }

        peers.push({
          peerId: peer.peerId,
          name: peer.name,
          role: 'client',
          connectedAt: peer.connectedAt,
          transportType: peer.transportType,
          rttMs: peer.rttMs,
          bytesUploaded: peer.bytesUploaded,
          bytesDownloaded: peer.bytesDownloaded,
          activeStreamsCount: streamsCount,
          logCaptureEnabled: peer.logCaptureEnabled ?? true,
          syncedConfigId: peer.syncedConfigId ?? null,
          lastSyncAt: peer.lastSyncAt ?? null,
          bufferedLogsCount: peer.bufferedLogsCount ?? 0,
        });
      }
    } else if (this.remotePeerId) {
      peers.push({
        peerId: this.remotePeerId,
        name: 'macOS Host (Surge)',
        role: 'host',
        connectedAt: this.connectedAt,
        transportType: this.transportType,
        rttMs: this.rttMs,
        bytesUploaded: this.totalBytesUp,
        bytesDownloaded: this.totalBytesDown,
        activeStreamsCount: this.activeStreams.size,
      });
    }

    this.onTelemetryUpdate({
      activeClients: peers,
      activeStreams: Array.from(this.activeStreams.values()),
      totalBytesUp: this.totalBytesUp,
      totalBytesDown: this.totalBytesDown,
      speedUpBps: 0,
      speedDownBps: 0,
      surgeEnhancedModeDetected: true,
      isSignalingConnected: this.signaling.isSignalingConnected(),
    });
  }

  public close(): void {
    this.closePeer();
    this.signaling.close();
    this.setState('closed');
  }

  private closePeer(): void {
    this.clearClientHandshakeTimers();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.dataChannel) {
      const dc = this.dataChannel;
      this.dataChannel = null;
      dc.onopen = null;
      dc.onclose = null;
      dc.onerror = null;
      dc.onmessage = null;
      try {
        dc.close();
      } catch (_) {}
    }
    if (this.pc) {
      const pc = this.pc;
      this.pc = null;
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.ondatachannel = null;
      try {
        pc.close();
      } catch (_) {}
    }

    this.clientPendingCandidates = [];
    this.clientRetryCount = 0;
    this.hostConnectingPeers.clear();
    this.hostPendingCandidates.clear();

    // Clean up host peers
    const peers = Array.from(this.hostPeers.values());
    this.hostPeers.clear();
    for (const peer of peers) {
      if (peer.heartbeatTimer) {
        clearInterval(peer.heartbeatTimer);
        peer.heartbeatTimer = undefined;
      }
      if (peer.dc) {
        const dc = peer.dc;
        peer.dc = null;
        dc.onopen = null;
        dc.onclose = null;
        dc.onerror = null;
        dc.onmessage = null;
        try {
          dc.close();
        } catch (_) {}
      }
      if (peer.pc) {
        const pc = peer.pc;
        peer.pc = null;
        pc.onicecandidate = null;
        pc.oniceconnectionstatechange = null;
        pc.ondatachannel = null;
        try {
          pc.close();
        } catch (_) {}
      }
    }
    this.streamToHostRoute.clear();
    this.peerRemoteToHostStream.clear();

    this.activeStreams.clear();
    this.streamListeners.clear();
  }

  public setRequireClientLogs(enabled: boolean): void {
    this.requireClientLogs = enabled;
    if (this.role === 'host') {
      this.pushLogConfigToPeer(undefined, enabled);
    }
  }

  public getRequireClientLogs(): boolean {
    return this.requireClientLogs;
  }

  public getActiveLogConfigId(): string {
    return this.activeLogConfigId;
  }

  public pushLogConfigToPeer(peerId?: string, enabled = true, customFilter?: any): string {
    if (this.role !== 'host') return '';
    const configId = `cfg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    this.activeLogConfigId = configId;
    const filter = customFilter || getLogFilterConfig();

    const targets = peerId
      ? [this.hostPeers.get(peerId)].filter((p): p is HostPeer => Boolean(p))
      : Array.from(this.hostPeers.values());

    for (const peer of targets) {
      if (peer.dc && peer.dc.readyState === 'open') {
        try {
          peer.dc.send(
            JSON.stringify({
              type: FRAME_TYPE.LOG_CONFIG_PUSH,
              configId,
              enabled,
              minLevel: filter.minLevel,
              categories: filter.categories,
            })
          );
          peer.logCaptureEnabled = enabled;
        } catch (e) {
          console.warn(`[P2PWebRTCTunnel] Error pushing log config to client #${peer.peerId}:`, e);
        }
      }
    }
    this.emitTelemetry();
    return configId;
  }

  public requestClientLogs(peerId?: string, limit = 200): void {
    if (this.role !== 'host') return;
    const targets = peerId
      ? [this.hostPeers.get(peerId)].filter((p): p is HostPeer => Boolean(p))
      : Array.from(this.hostPeers.values());

    for (const peer of targets) {
      if (peer.dc && peer.dc.readyState === 'open') {
        try {
          peer.dc.send(
            JSON.stringify({
              type: FRAME_TYPE.LOG_REQUEST,
              limit,
            })
          );
        } catch (e) {
          console.warn(`[P2PWebRTCTunnel] Error requesting logs from client #${peer.peerId}:`, e);
        }
      }
    }
  }
}

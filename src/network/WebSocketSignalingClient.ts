/**
 * src/network/WebSocketSignalingClient.ts
 * Manages WebSocket connection to the Cloudflare Signaling Worker.
 */

import { buildCompositeRoomKey } from './SignalingConfig';

export type SignalingEventCallback = (data: any) => void;

export class WebSocketSignalingClient {
  private workerUrl: string;
  private rawRoomId: string;
  private password: string;
  private role: 'host' | 'client';
  private peerId: string;
  private clientName: string;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private listeners: Map<string, SignalingEventCallback[]> = new Map();

  constructor(options: {
    workerUrl: string;
    roomId: string;
    password?: string;
    role?: 'host' | 'client';
    peerId?: string;
    clientName?: string;
  }) {
    this.workerUrl = options.workerUrl.trim();
    this.rawRoomId = options.roomId.trim();
    this.password = options.password || '';
    this.role = options.role || 'client';
    this.peerId = options.peerId || `peer_${Math.random().toString(36).slice(2, 8)}`;
    this.clientName = options.clientName || (this.role === 'host' ? 'Host (macOS)' : 'Client (Browser)');
  }

  get fullRoomKey(): string {
    return buildCompositeRoomKey(this.rawRoomId, this.password);
  }

  get connectUrl(): string {
    let base = this.workerUrl;
    if (!base.startsWith('ws://') && !base.startsWith('wss://')) {
      base = base.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
      if (!base.startsWith('ws://') && !base.startsWith('wss://')) {
        base = 'wss://' + base;
      }
    }
    const url = new URL(base);
    url.searchParams.set('room', this.fullRoomKey);
    url.searchParams.set('roomId', this.fullRoomKey);
    url.searchParams.set('password', this.password);
    url.searchParams.set('peerId', this.peerId);
    url.searchParams.set('isHost', String(this.role === 'host'));
    url.searchParams.set('role', this.role);
    url.searchParams.set('name', this.clientName);
    return url.toString();
  }

  public onProgress?: (msg: string) => void;
  private isRoomJoined = false;

  public getIsRoomJoined(): boolean {
    return this.isRoomJoined;
  }

  /**
   * Connects to Signaling Server with:
   * 1) 5-second strict timeout per probe
   * 2) Concurrent race probing (spawns 2 probe sockets staggered by 400ms)
   * 3) Auto-retry up to 5 times if unstable public server fails or hangs
   * 4) First connected socket wins; lingering probes are immediately closed
   */
  public async connect(options?: {
    timeoutMs?: number;
    maxRetries?: number;
    concurrentProbes?: number;
  }): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const timeoutMs = options?.timeoutMs ?? 5000;
    const maxRetries = options?.maxRetries ?? 5;
    const probeCount = options?.concurrentProbes ?? 2;

    this.isRoomJoined = false;

    let lastError: any = new Error('Signaling connection timed out');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const progressMsg = `Connecting signaling server (Attempt ${attempt}/${maxRetries}, ${probeCount} probes, 5s timeout)...`;
      console.log(`[WebSocketSignalingClient] ${progressMsg}`);
      if (this.onProgress) {
        this.onProgress(progressMsg);
      }
      this.emit('progress', { attempt, maxRetries, message: progressMsg });

      try {
        await this.raceProbeConnection(timeoutMs, probeCount);
        console.log(`[WebSocketSignalingClient] Signaling connection established on attempt ${attempt}!`);
        this.emit('open', { peerId: this.peerId, role: this.role });
        return;
      } catch (err: any) {
        lastError = err;
        console.warn(`[WebSocketSignalingClient] Attempt ${attempt}/${maxRetries} failed:`, err?.message || err);
        if (attempt < maxRetries) {
          const retryWaitMsg = `Attempt ${attempt} timed out or failed. Retrying next probe...`;
          if (this.onProgress) this.onProgress(retryWaitMsg);
          // Brief pause before next retry attempt
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    const finalErrMsg = `Failed to connect signaling server after ${maxRetries} attempts: ${lastError?.message || lastError}`;
    this.emit('error', new Error(finalErrMsg));
    throw new Error(finalErrMsg);
  }

  /**
   * Races multiple probe WebSockets concurrently. The first one to fire `onopen` wins.
   * All other losing probes are immediately terminated.
   */
  private raceProbeConnection(timeoutMs: number, probeCount: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const activeProbes: WebSocket[] = [];
      const timers: any[] = [];

      const cleanup = () => {
        for (const t of timers) clearTimeout(t);
        timers.length = 0;
      };

      const targetUrl = this.connectUrl;

      // Overall attempt timeout timer (5s)
      const overallTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          for (const s of activeProbes) {
            try {
              s.onopen = null;
              s.onerror = null;
              s.onclose = null;
              s.close();
            } catch (_) {}
          }
          reject(new Error(`WebSocket handshake timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      timers.push(overallTimer);

      let failedProbes = 0;

      const launchProbe = (probeIndex: number) => {
        if (settled) return;
        try {
          const probeWs = new WebSocket(targetUrl);
          activeProbes.push(probeWs);

          probeWs.onopen = () => {
            if (!settled) {
              settled = true;
              cleanup();

              // Close all other probe connections immediately
              for (const other of activeProbes) {
                if (other !== probeWs) {
                  try {
                    other.onopen = null;
                    other.onerror = null;
                    other.onclose = null;
                    other.close();
                  } catch (_) {}
                }
              }

              // Win! Adopt probeWs as the primary active WebSocket
              this.ws = probeWs;
              this.isConnected = true;
              this.bindActiveSocketEvents(probeWs);
              resolve();
            } else {
              // Settled already: close redundant probe
              try {
                probeWs.close();
              } catch (_) {}
            }
          };

          probeWs.onerror = (e) => {
            if (settled) return;
            failedProbes++;
            if (failedProbes >= probeCount) {
              if (!settled) {
                settled = true;
                cleanup();
                reject(new Error('All concurrent WebSocket probes failed'));
              }
            }
          };

          probeWs.onclose = (ev) => {
            if (settled) return;
            failedProbes++;
            if (failedProbes >= probeCount) {
              if (!settled) {
                settled = true;
                cleanup();
                reject(new Error(`WebSocket probes closed (${ev.code})`));
              }
            }
          };
        } catch (err) {
          failedProbes++;
          if (failedProbes >= probeCount && !settled) {
            settled = true;
            cleanup();
            reject(err);
          }
        }
      };

      // Launch probe 0 immediately, probe 1 staggered by 400ms
      launchProbe(0);
      if (probeCount > 1) {
        const staggerTimer = setTimeout(() => {
          if (!settled) launchProbe(1);
        }, 400);
        timers.push(staggerTimer);
      }
    });
  }

  private pingTimer: any = null;

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', time: Date.now() }));
        } catch (_) {}
      }
    }, 20000);
  }

  private stopKeepAlive(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private bindActiveSocketEvents(ws: WebSocket) {
    this.startKeepAlive();

    ws.onopen = () => {
      this.isConnected = true;
      this.emit('open', { peerId: this.peerId, role: this.role });
    };

    ws.onerror = (err) => {
      this.emit('error', err);
    };

    ws.onclose = (ev) => {
      this.isConnected = false;
      this.isRoomJoined = false;
      this.stopKeepAlive();
      this.emit('close', ev);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data && data.type) {
          if (data.type === 'ping') {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'pong', time: data.time || Date.now() }));
              } catch (_) {}
            }
            return;
          }
          if (data.type === 'pong') {
            return;
          }
          if (data.type === 'room_info' || data.type === 'joined_room' || data.type === 'host_ready') {
            this.isRoomJoined = true;
          }
          // Normalize sender identifier
          if (!data.fromPeerId && (data.peerId || data.senderId || data.from)) {
            data.fromPeerId = data.peerId || data.senderId || data.from;
          }
          this.emit(data.type, data);
        }
      } catch (e) {
        console.error('[WebSocketSignalingClient] Failed to parse message:', e);
      }
    };
  }

  public sendOffer(targetPeerId: string, sdpOffer: RTCSessionDescriptionInit): void {
    this.send({
      type: 'offer',
      targetPeerId,
      fromPeerId: this.peerId,
      sdp: sdpOffer,
    });
  }

  public sendAnswer(sdpAnswer: RTCSessionDescriptionInit, targetPeerId?: string): void {
    this.send({
      type: 'answer',
      targetPeerId,
      fromPeerId: this.peerId,
      sdp: sdpAnswer,
    });
  }

  public sendCandidate(targetPeerId: string | null, candidate: RTCIceCandidateInit): void {
    this.send({
      type: 'candidate',
      targetPeerId,
      fromPeerId: this.peerId,
      candidate,
    });
  }

  public send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public on(event: string, cb: SignalingEventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(cb);
  }

  public off(event: string, cb: SignalingEventCallback): void {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(event, list.filter((fn) => fn !== cb));
  }

  public emit(event: string, data?: any): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const cb of list) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[WebSocketSignalingClient] Error in listener for ${event}:`, err);
      }
    }
  }

  public close(): void {
    this.stopKeepAlive();
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.onopen = null;
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    this.isConnected = false;
  }

  public isSignalingConnected(): boolean {
    return this.isConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public getPeerId(): string {
    return this.peerId;
  }
}

import { useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { GoogleProbeResult } from '../types/network';
import { ConnectivityProbe } from '../network/ConnectivityProbe';
import { P2PWebRTCTunnel } from '../network/P2PWebRTCTunnel';

export function useGoogleProbe() {
  const [googleResult, setGoogleResult] = useState<GoogleProbeResult | null>(null);
  const [isCheckingGoogle, setIsCheckingGoogle] = useState<boolean>(false);
  const [bypassedGoogle, setBypassedGoogle] = useState<boolean>(false);

  // Google 204 Probe with strict 5-second timeout helper
  const probeWith5sTimeout = async <T,>(action: Promise<T>): Promise<T> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Google 204 check timed out after 5000ms')), 5000);
    });
    return Promise.race([action, timeoutPromise]);
  };

  // Host Google 204 Probe via local SOCKS5 proxy / adapter with strict 5-second timeout
  const handleHostProbeGoogle = async (
    socks5Port: number,
    addLog: (level: 'info' | 'warn' | 'error', text: string) => void
  ): Promise<GoogleProbeResult> => {
    setIsCheckingGoogle(true);
    addLog('info', '[Host] Verifying Google 204 connectivity (strict 5s timeout)...');
    try {
      if (isTauri()) {
        const res = await probeWith5sTimeout(invoke<any>('check_google_204', { port: socks5Port }));
        const probeRes: GoogleProbeResult = {
          success: res.success,
          status: res.status,
          latencyMs: res.latency_ms,
          checkedAt: Date.now(),
          message: res.message,
        };
        setGoogleResult(probeRes);
        if (probeRes.success) {
          addLog('info', `[Host] Google 204 Verified (${probeRes.latencyMs}ms)! Web browsing ready.`);
        } else {
          addLog('warn', `[Host] Google 204 check failed: ${probeRes.message}`);
        }
        return probeRes;
      } else {
        const start = Date.now();
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        await fetch('https://www.google.com/generate_204', { mode: 'no-cors', signal: controller.signal });
        clearTimeout(tid);
        const latency = Date.now() - start;
        const probeRes: GoogleProbeResult = {
          success: true,
          status: 204,
          latencyMs: latency,
          checkedAt: Date.now(),
          message: `Google Verified (${latency}ms)`,
        };
        setGoogleResult(probeRes);
        addLog('info', `[Host] Google 204 Verified (${latency}ms)! Web browsing ready.`);
        return probeRes;
      }
    } catch (err: any) {
      const errorMsg = String(err?.message || err);
      const probeRes: GoogleProbeResult = {
        success: false,
        status: 408,
        latencyMs: 5000,
        checkedAt: Date.now(),
        message: errorMsg,
      };
      setGoogleResult(probeRes);
      addLog('warn', `[Host] Google probe failed: ${errorMsg}`);
      return probeRes;
    } finally {
      setIsCheckingGoogle(false);
    }
  };

  // Client Google 204 Probe across WebRTC tunnel (or direct fallback if tunnel offline) with strict 5-second timeout
  const handleClientProbeGoogle = async (
    socks5Port: number,
    tunnel: P2PWebRTCTunnel | null,
    addLog: (level: 'info' | 'warn' | 'error', text: string) => void
  ): Promise<GoogleProbeResult> => {
    setIsCheckingGoogle(true);
    try {
      if (tunnel && (tunnel.getState() === 'p2p_connected' || tunnel.getState() === 'ready')) {
        addLog('info', 'Probing Google 204 connectivity across WebRTC DataChannel (5s timeout)...');
        const res = await ConnectivityProbe.probeGoogle(tunnel, 5000);
        setGoogleResult(res);
        if (res.success) {
          addLog('info', `Google 204 Verified successfully (${res.latencyMs}ms)! Web browsing unlocked.`);
        } else {
          addLog('warn', `Google 204 check failed: ${res.message}`);
        }
        return res;
      } else {
        addLog('info', 'Testing Google 204 directly (5s timeout)...');
        if (isTauri()) {
          const res = await probeWith5sTimeout(invoke<any>('check_google_204', { port: socks5Port }));
          const probeRes: GoogleProbeResult = {
            success: res.success,
            status: res.status,
            latencyMs: res.latency_ms,
            checkedAt: Date.now(),
            message: res.message,
          };
          setGoogleResult(probeRes);
          if (probeRes.success) {
            addLog('info', `Google 204 Verified (${probeRes.latencyMs}ms)! In-app web browsing unlocked.`);
          }
          return probeRes;
        } else {
          const start = Date.now();
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 5000);
          await fetch('https://www.google.com/generate_204', { mode: 'no-cors', signal: controller.signal });
          clearTimeout(tid);
          const latency = Date.now() - start;
          const probeRes: GoogleProbeResult = {
            success: true,
            status: 204,
            latencyMs: latency,
            checkedAt: Date.now(),
            message: `Google Verified (${latency}ms)`,
          };
          setGoogleResult(probeRes);
          addLog('info', `Google 204 Verified (${latency}ms)! In-app web browsing unlocked.`);
          return probeRes;
        }
      }
    } catch (err: any) {
      const resErr: GoogleProbeResult = {
        success: false,
        status: 408,
        latencyMs: 5000,
        checkedAt: Date.now(),
        message: err?.message || 'Google 204 check timed out after 5000ms',
      };
      setGoogleResult(resErr);
      addLog('warn', `Google probe exception: ${resErr.message}`);
      return resErr;
    } finally {
      setIsCheckingGoogle(false);
    }
  };

  return {
    googleResult,
    setGoogleResult,
    isCheckingGoogle,
    bypassedGoogle,
    setBypassedGoogle,
    handleHostProbeGoogle,
    handleClientProbeGoogle,
  };
}

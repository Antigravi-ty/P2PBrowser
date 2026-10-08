import { create } from 'zustand';
import { AppRole, GoogleProbeResult, TunnelState } from '../types/network';

interface TunnelStoreState {
  role: AppRole;
  setRole: (r: AppRole) => void;
  roomId: string;
  setRoomId: (id: string) => void;
  password: string;
  setPassword: (p: string) => void;
  socks5Port: number;
  setSocks5Port: (p: number) => void;
  signalingUrl: string;
  setSignalingUrl: (url: string) => void;
  tunnelState: TunnelState;
  setTunnelState: (s: TunnelState) => void;
  signalingProgress: string;
  setSignalingProgress: (p: string) => void;
  googleResult: GoogleProbeResult | null;
  setGoogleResult: (res: GoogleProbeResult | null) => void;
  isCheckingGoogle: boolean;
  setIsCheckingGoogle: (checking: boolean) => void;
  bypassedGoogle: boolean;
  setBypassedGoogle: (bypassed: boolean) => void;
}

export const useTunnelStore = create<TunnelStoreState>((set) => ({
  role: 'client',
  setRole: (role) => set({ role }),
  roomId: '0000',
  setRoomId: (roomId) => set({ roomId }),
  password: '',
  setPassword: (password) => set({ password }),
  socks5Port: 10808,
  setSocks5Port: (socks5Port) => set({ socks5Port }),
  signalingUrl: '',
  setSignalingUrl: (signalingUrl) => set({ signalingUrl }),
  tunnelState: 'idle',
  setTunnelState: (tunnelState) => set({ tunnelState }),
  signalingProgress: '',
  setSignalingProgress: (signalingProgress) => set({ signalingProgress }),
  googleResult: null,
  setGoogleResult: (googleResult) => set({ googleResult }),
  isCheckingGoogle: false,
  setIsCheckingGoogle: (isCheckingGoogle) => set({ isCheckingGoogle }),
  bypassedGoogle: false,
  setBypassedGoogle: (bypassedGoogle) => set({ bypassedGoogle }),
}));

/**
 * src/network/SignalingConfig.ts
 * Centralized configuration for WebRTC signaling and room identification.
 */

export const DEFAULT_SIGNALING_URL = 'wss://unstable.test.breadguy.link/ws';
export const SIGNALING_ROOM_PREFIX = 'TCPPROXYROOM10051132-';

/**
 * Generates a default 4-digit room code between 1000 and 9999.
 */
export function generateRandomRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Combines roomId and password into a unique pair key.
 * This ensures room + password is an isolated namespace, avoiding collisions.
 * e.g., Room 123 + Pwd A vs Room 123 + Pwd B are two completely independent rooms.
 */
export function buildCompositeRoomKey(rawRoomId: string, password: string = ''): string {
  let cleanId = (rawRoomId || '').trim();
  if (cleanId.startsWith(SIGNALING_ROOM_PREFIX)) {
    cleanId = cleanId.slice(SIGNALING_ROOM_PREFIX.length);
  }
  const cleanPassword = (password || '').trim();
  const pairSuffix = cleanPassword ? `__${cleanPassword}` : '';
  return `${SIGNALING_ROOM_PREFIX}${cleanId}${pairSuffix}`;
}

/**
 * Parses a composite room key back into display roomId and password indicator.
 */
export function parseCompositeRoomKey(fullRoomKey: string): { roomId: string; hasPassword: boolean } {
  let stripped = fullRoomKey.startsWith(SIGNALING_ROOM_PREFIX)
    ? fullRoomKey.slice(SIGNALING_ROOM_PREFIX.length)
    : fullRoomKey;
  const parts = stripped.split('__');
  return {
    roomId: parts[0] || '',
    hasPassword: parts.length > 1 && Boolean(parts[1]),
  };
}

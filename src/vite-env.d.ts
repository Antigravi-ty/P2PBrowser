/// <reference types="vite/client" />

declare const __APP_COMMIT_HASH__: string;
declare const __APP_BUILD_TIME__: string;

declare module 'virtual:shortcut-lucide-icons' {
  import type { LucideIcon } from 'lucide-react';
  export const shortcutLucideIcons: Record<string, LucideIcon>;
}


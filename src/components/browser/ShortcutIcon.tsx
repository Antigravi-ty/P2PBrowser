import React from 'react';
import { shortcutLucideIcons } from 'virtual:shortcut-lucide-icons';
import { toPascalCase } from '../../utils/shortcuts';

export interface ShortcutItem {
  title: string;
  url: string;
  icon: string;
  color?: string;
  iconSvg?: string;
}

const localSvgModules = import.meta.glob('../../assets/shortcuts-svg/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const localSvgMap: Record<string, string> = {};
for (const [filePath, content] of Object.entries(localSvgModules)) {
  const match = filePath.match(/\/([^/]+)\.svg$/);
  if (match) {
    localSvgMap[match[1].toLowerCase()] = content;
  }
}

interface ShortcutIconProps {
  icon?: string;
  iconSvg?: string;
  title: string;
  color?: string;
}

export const ShortcutIcon: React.FC<ShortcutIconProps> = ({ icon, iconSvg, title, color }) => {
  // Strict check: icon must be explicitly declared (or legacy iconSvg)
  if (!icon && !iconSvg) {
    throw new Error(
      `[shortcuts] Shortcut "${title}" does not specify an "icon". Every shortcut must explicitly declare an icon (e.g. "search", "svg:google", "text:AWS").`
    );
  }

  // 1. Legacy inline SVG fallback (deprecated)
  if (!icon && iconSvg) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          flexShrink: 0,
          color: color || 'var(--fg-muted)',
        }}
        dangerouslySetInnerHTML={{ __html: iconSvg }}
      />
    );
  }

  const iconTrimmed = (icon || '').trim();

  // 2. Standalone local SVG: "svg:name"
  if (iconTrimmed.startsWith('svg:')) {
    let svgName = iconTrimmed.slice(4).trim().toLowerCase();
    if (svgName.endsWith('.svg')) {
      svgName = svgName.slice(0, -4);
    }

    const svgContent = localSvgMap[svgName];
    if (!svgContent) {
      throw new Error(
        `[shortcuts] Local SVG "svg:${svgName}" referenced by "${title}" does not exist in src/assets/shortcuts-svg/. Available: [${Object.keys(
          localSvgMap
        ).join(', ')}]`
      );
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          flexShrink: 0,
          color: color || 'currentColor',
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    );
  }

  // 3. Text monogram badge: "text:XYZ" (up to 3 characters)
  if (iconTrimmed.startsWith('text:')) {
    const rawText = iconTrimmed.slice(5).trim();
    if (rawText.length === 0 || rawText.length > 3) {
      throw new Error(
        `[shortcuts] Text icon "${iconTrimmed}" in shortcut "${title}" is invalid. Text must be between 1 and 3 characters.`
      );
    }

    const displayText = rawText.toUpperCase();
    const len = displayText.length;
    const fontSize = len === 1 ? '11px' : len === 2 ? '8.5px' : '7px';
    const letterSpacing = len === 1 ? '0' : '-0.5px';

    return (
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '4px',
          backgroundColor: 'var(--bg-subtle)',
          border: '1px solid var(--border-default)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize,
          fontWeight: len === 3 ? 800 : 700,
          letterSpacing,
          fontFamily: "'Monaspace Neon', 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
          color: color || 'var(--fg-muted)',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        {displayText}
      </span>
    );
  }

  // 4. Default: Lucide icon name (e.g. "search", "compass", "book-open")
  const pascalName = toPascalCase(iconTrimmed);
  const LucideComponent = shortcutLucideIcons[pascalName];

  if (!LucideComponent) {
    throw new Error(
      `[shortcuts] Unknown Lucide icon "${iconTrimmed}" (normalized: "${pascalName}") specified for shortcut "${title}". Please choose a valid Lucide icon from https://lucide.dev/icons.`
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        flexShrink: 0,
        color: color || 'var(--fg-muted)',
      }}
    >
      <LucideComponent size={18} strokeWidth={2} color={color || 'currentColor'} />
    </span>
  );
};

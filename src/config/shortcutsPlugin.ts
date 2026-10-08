import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import * as LucideIcons from 'lucide-react';
import { toPascalCase } from '../utils/shortcuts';


export function shortcutsIconPlugin(): Plugin {
  const virtualModuleId = 'virtual:shortcut-lucide-icons';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;
  const shortcutsPath = path.resolve(process.cwd(), 'src/config/shortcuts.json');
  const svgDir = path.resolve(process.cwd(), 'src/assets/shortcuts-svg');

  function validateAndCollectIcons(): string[] {
    if (!fs.existsSync(shortcutsPath)) {
      throw new Error(`[shortcuts] Config file not found: ${shortcutsPath}`);
    }
    const content = fs.readFileSync(shortcutsPath, 'utf-8');
    let shortcuts: any[];
    try {
      shortcuts = JSON.parse(content);
    } catch (e: any) {
      throw new Error(`[shortcuts] Failed to parse shortcuts.json: ${e.message}`);
    }

    if (!Array.isArray(shortcuts)) {
      throw new Error('[shortcuts] shortcuts.json root must be an array of shortcut items.');
    }

    const lucideIconSet = new Set<string>();

    for (const [index, item] of shortcuts.entries()) {
      const idxLabel = `Item #${index + 1} ("${item?.title || 'unnamed'}")`;
      if (!item.title || typeof item.title !== 'string') {
        throw new Error(`[shortcuts] ${idxLabel} is missing required string "title".`);
      }
      if (!item.url || typeof item.url !== 'string') {
        throw new Error(`[shortcuts] ${idxLabel} is missing required string "url".`);
      }

      const iconStr = item.icon || (item.iconSvg ? '__legacy_svg__' : '');
      if (!iconStr || typeof iconStr !== 'string') {
        throw new Error(
          `[shortcuts] ${idxLabel} is missing required string "icon". Every shortcut must explicitly define an icon (e.g. "search", "svg:google", "text:AWS"). Fallback is not permitted.`
        );
      }

      if (iconStr === '__legacy_svg__') {
        continue;
      }

      if (iconStr.startsWith('svg:')) {
        let svgName = iconStr.slice(4).trim();
        if (svgName.endsWith('.svg')) svgName = svgName.slice(0, -4);
        const svgFile = path.join(svgDir, `${svgName}.svg`);
        if (!fs.existsSync(svgFile)) {
          const available = fs.existsSync(svgDir) ? fs.readdirSync(svgDir).join(', ') : 'none';
          throw new Error(
            `[shortcuts] ${idxLabel} references local SVG "${svgName}.svg" which does not exist in src/assets/shortcuts-svg/. Available SVGs: [${available}]`
          );
        }
      } else if (iconStr.startsWith('text:')) {
        const textVal = iconStr.slice(5).trim();
        if (textVal.length === 0 || textVal.length > 3) {
          throw new Error(
            `[shortcuts] ${idxLabel} text icon "${iconStr}" is invalid. Text icons must be between 1 and 3 characters.`
          );
        }
      } else {
        // Lucide icon name
        const pascalName = toPascalCase(iconStr);
        if (!(pascalName in LucideIcons)) {
          throw new Error(
            `[shortcuts] ${idxLabel} specifies unknown Lucide icon "${iconStr}". Normalized name "${pascalName}" was not found in lucide-react. Please check available icons at https://lucide.dev/icons.`
          );
        }
        lucideIconSet.add(pascalName);
      }
    }

    return Array.from(lucideIconSet);
  }

  return {
    name: 'vite-plugin-shortcut-icons',
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        this.addWatchFile(shortcutsPath);
        const usedIcons = validateAndCollectIcons();
        if (usedIcons.length === 0) {
          return `export const shortcutLucideIcons = {};\n`;
        }
        const importStatements = `import { ${usedIcons.join(', ')} } from 'lucide-react';\n`;
        const exportStatements = `export const shortcutLucideIcons = { ${usedIcons.join(', ')} };\n`;
        return importStatements + exportStatements;
      }
    },
    buildStart() {
      validateAndCollectIcons();
    },
    handleHotUpdate({ file, server }) {
      if (file === shortcutsPath) {
        const mod = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
      }
    },
  };
}

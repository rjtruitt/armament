/**
 * ClipboardReader — cross-platform clipboard detection for images and text.
 *
 * macOS: pngpaste (if available) + pbpaste fallback
 * Linux: xclip (X11) or wl-paste (Wayland)
 * Windows: PowerShell via .NET
 */
import { execSync } from 'child_process';
import { platform } from 'os';

export interface ClipboardContent {
  type: 'image' | 'text';
  data: string;
  mediaType?: string;
}

/**
 * Read clipboard content — detects whether it's an image or text.
 * Returns null if clipboard is empty or content can't be read.
 */
export function readClipboard(): ClipboardContent | null {
  try {
    const os = platform();
    if (os === 'darwin') return readMacClipboard();
    if (os === 'linux') return readLinuxClipboard();
    if (os === 'win32') return readWindowsClipboard();
    // Fallback: try to read text
    return readTextFallback();
  } catch {
    return null;
  }
}

/**
 * Try to read text from clipboard via any available platform method.
 */
export function readTextClipboard(): string | null {
  try {
    const os = platform();
    if (os === 'darwin') {
      return execSync('pbpaste', { encoding: 'utf-8', timeout: 3000 }).trim() || null;
    }
    if (os === 'linux') {
      return execSync('xclip -selection clipboard -o 2>/dev/null || wl-paste 2>/dev/null', { encoding: 'utf-8', timeout: 3000 }).trim() || null;
    }
    if (os === 'win32') {
      return execSync(
        'powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()"',
        { encoding: 'utf-8', timeout: 5000 },
      ).trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}

/** macOS: detect clipboard content type. */
function readMacClipboard(): ClipboardContent | null {
  // Check if clipboard has an image using clipboard info
  try {
    const info = execSync(
      `osascript -e 'clipboard info'`,
      { encoding: 'utf-8', timeout: 3000 },
    );
    const isImage = /TIFF picture|«class PNGf»/i.test(info);

    if (isImage) {
      // Try pngpaste first (brew install pngpaste)
      try {
        const data = execSync(
          'pngpaste /dev/stdout 2>/dev/null | base64',
          { encoding: 'base64', timeout: 5000 },
        ).trim();
        if (data) {
          return { type: 'image', data, mediaType: 'image/png' };
        }
      } catch {
        // pngpaste not available, try osascript TIFF conversion
      }

      // Fallback: osascript to get TIFF, pipe through sips to PNG
      try {
        const data = execSync(
          `osascript -e 'set img to (the clipboard as picture)' -e 'set tiffData to (get img as TIFF picture)' -e 'return tiffData' 2>/dev/null | base64`,
          { encoding: 'base64', timeout: 5000 },
        ).trim();
        if (data) {
          return { type: 'image', data, mediaType: 'image/tiff' };
        }
      } catch {
        // Give up on image
      }
    }
  } catch {
    // Clipboard info failed, fall through to text
  }

  // Fall back to text
  return readMacText();
}

/** macOS: read plain text from clipboard using pbpaste. */
function readMacText(): ClipboardContent | null {
  try {
    const text = execSync('pbpaste', { encoding: 'utf-8', timeout: 3000 }).trim();
    if (!text) return null;
    return { type: 'text', data: text };
  } catch {
    return null;
  }
}

/** Linux: read clipboard using xclip or wl-paste. */
function readLinuxClipboard(): ClipboardContent | null {
  // Try image first
  for (const cmd of [
    'xclip -selection clipboard -t image/png -o 2>/dev/null',
    'xclip -selection clipboard -t image/jpeg -o 2>/dev/null',
    'wl-paste -t image/png 2>/dev/null',
  ]) {
    try {
      const data = execSync(cmd, { encoding: 'base64', timeout: 3000 }).trim();
      if (data && data.length > 50) {
        // Detect actual format from header bytes
        let mediaType = 'image/png';
        try {
          const buf = Buffer.from(data, 'base64');
          const hex = buf.slice(0, 4).toString('hex');
          if (hex.startsWith('89504e47')) mediaType = 'image/png';
          else if (hex.startsWith('ffd8')) mediaType = 'image/jpeg';
          else if (hex.startsWith('474946')) mediaType = 'image/gif';
          else if (hex.startsWith('524946')) mediaType = 'image/webp';
        } catch { /* use default */ }
        return { type: 'image', data, mediaType };
      }
    } catch {
      continue;
    }
  }

  // Fall back to text
  try {
    const text = execSync(
      'xclip -selection clipboard -o 2>/dev/null || wl-paste 2>/dev/null',
      { encoding: 'utf-8', timeout: 3000 },
    ).trim();
    if (!text) return null;
    return { type: 'text', data: text };
  } catch {
    return null;
  }
}

/** Windows: read clipboard using PowerShell. */
function readWindowsClipboard(): ClipboardContent | null {
  // Try image first
  try {
    const result = execSync(
      'powershell -NoProfile -Command '
      + '"Add-Type -AssemblyName System.Windows.Forms; '
      + '$clip = [System.Windows.Forms.Clipboard]::GetImage(); '
      + 'if ($clip -ne $null) { '
      + '  $ms = New-Object System.IO.MemoryStream; '
      + '  $clip.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); '
      + '  [System.Convert]::ToBase64String($ms.ToArray()) '
      + '} else { \'\' }"',
      { encoding: 'utf-8', timeout: 10000 },
    ).trim();
    if (result) {
      return { type: 'image', data: result, mediaType: 'image/png' };
    }
  } catch {
    // Fall through
  }

  // Fall back to text
  try {
    const text = execSync(
      'powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()"',
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    if (!text) return null;
    return { type: 'text', data: text };
  } catch {
    return null;
  }
}

/** Fallback: try to read text via any available method. */
function readTextFallback(): ClipboardContent | null {
  const text = readTextClipboard();
  if (!text) return null;
  return { type: 'text', data: text };
}

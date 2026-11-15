/**
 * Handing a backup to the person, and reading one back. On Android the file is written to
 * the app's cache and passed to the system share sheet, since a WebView cannot download
 * files; in a browser it is an ordinary download. This is the only module that touches
 * the Filesystem and Share plugins.
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export type SaveResult = 'saved' | 'cancelled';

const isCancel = (error: unknown): boolean => error instanceof Error && /cancel/i.test(error.message);

/** Saves `text` as a file called `name`. Resolves `cancelled` when the person backs out of the share sheet. */
export async function saveBackupFile(name: string, text: string): Promise<SaveResult> {
  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: 'Lantern backup', url: written.uri, dialogTitle: 'Keep your Lantern backup' });
    } catch (error) {
      if (isCancel(error)) return 'cancelled';
      throw error;
    }
    return 'saved';
  }

  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Give the browser a moment to start the download before the link goes away.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return 'saved';
}

export const readBackupFile = (file: File): Promise<string> => file.text();

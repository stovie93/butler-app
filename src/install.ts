import { File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { artifactUrl, type Job } from './api';
import { Settings } from './settings';

// Android's Intent.FLAG_GRANT_READ_URI_PERMISSION. The package installer runs in
// another process, so without this it cannot read our content:// URI.
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_MIME = 'application/vnd.android.package-archive';

export type InstallProgress = { bytesWritten: number; totalBytes: number };

/**
 * Pull a finished build's APK down from the gateway and hand it to Android's
 * package installer.
 *
 * The download has to happen in-app rather than as a tappable link, because
 * every gateway route is bearer-token authed — a browser following a plain URL
 * would just get a 401. We fetch with the token, drop the file in the cache
 * directory, and pass Android a content:// URI from Expo's FileProvider.
 */
export async function installArtifact(
  settings: Settings,
  job: Job,
  onProgress?: (p: InstallProgress) => void,
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('APK install is Android-only.');
  }
  if (job.artifact?.type !== 'apk') {
    throw new Error('This build did not produce an installable APK.');
  }

  // Cache, not documents: an APK is disposable the moment it's installed, and
  // we re-download rather than trust a stale copy.
  const dest = new File(Paths.cache, safeName(job.artifact.name));
  try {
    if (dest.exists) dest.delete();
  } catch {
    // A leftover we can't remove is not fatal — the download overwrites it.
  }

  const task = File.createDownloadTask(artifactUrl(settings, job.id), dest, {
    headers: { Authorization: `Bearer ${settings.token}` },
    onProgress: onProgress
      ? ({ bytesWritten, totalBytes }) => onProgress({ bytesWritten, totalBytes })
      : undefined,
  });

  const file = await task.downloadAsync();
  if (!file?.exists || !file.size) {
    throw new Error('The APK downloaded empty — check the gateway is still reachable.');
  }

  const uri = file.contentUri;
  if (!uri) throw new Error('Could not build a content:// URI for the download.');

  // ACTION_VIEW with the APK mime type is what opens the system installer.
  // Android then asks the user to confirm, and — the first time — to allow
  // Butler to install unknown apps.
  await startActivityAsync('android.intent.action.VIEW', {
    data: uri,
    type: APK_MIME,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}

/** Keep the server-supplied filename from escaping the cache directory. */
function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'build.apk';
  const cleaned = base.replace(/[^\w.-]/g, '_');
  return cleaned.toLowerCase().endsWith('.apk') ? cleaned : `${cleaned}.apk`;
}

/** Human-readable size for the install button label. */
export function formatSize(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '';
  const mb = bytes / 1_048_576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

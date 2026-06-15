import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

const isNative = Capacitor.isNativePlatform();
const webStore = new Map<string, string>();

export async function saveTrack(id: string, ext: string, text: string): Promise<string> {
  const ref = `tracks/${id}.${ext}`;
  if (isNative) {
    await Filesystem.writeFile({ path: ref, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  } else {
    webStore.set(ref, text);
  }
  return ref;
}

export async function readTrack(trackRef: string): Promise<string> {
  if (isNative) {
    const result = await Filesystem.readFile({ path: trackRef, directory: Directory.Data, encoding: Encoding.UTF8 });
    return result.data as string;
  }
  const text = webStore.get(trackRef);
  if (!text) throw new Error(`Track not found: ${trackRef}`);
  return text;
}

export async function deleteTrack(trackRef: string): Promise<void> {
  if (isNative) {
    try {
      await Filesystem.deleteFile({ path: trackRef, directory: Directory.Data });
    } catch {
      // file already gone
    }
  } else {
    webStore.delete(trackRef);
  }
}

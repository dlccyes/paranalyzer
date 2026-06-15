import { FilePicker } from "@capawesome/capacitor-file-picker";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";

const isNative = Capacitor.isNativePlatform();

export async function mobilePickTrackFiles(): Promise<{ name: string; text: string }[]> {
  const result = await FilePicker.pickFiles({
    types: ["application/octet-stream", "text/plain", "text/*"],
    limit: 0,
    readData: true,
  });

  const out: { name: string; text: string }[] = [];
  for (const file of result.files) {
    const name = file.name ?? "flight.igc";
    let text: string;
    if (file.data) {
      text = atob(file.data);
    } else if (file.path) {
      const r = await Filesystem.readFile({
        path: file.path,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      text = r.data as string;
    } else {
      continue;
    }
    out.push({ name, text });
  }
  return out;
}

export async function mobileSaveBackupFile(name: string, json: string): Promise<void> {
  if (isNative) {
    // Task K fix: write with recursive:true, then share so user can choose destination
    await Filesystem.writeFile({
      path: name,
      data: json,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });

    const uriResult = await Filesystem.getUri({
      path: name,
      directory: Directory.Documents,
    });

    try {
      await Share.share({
        title: name,
        url: uriResult.uri,
        dialogTitle: "Save backup",
      });
    } catch {
      // user dismissed share sheet — file still saved to Documents
    }
  } else {
    // Web fallback in Capacitor dev mode
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

export async function mobilePickBackupFile(): Promise<string | null> {
  const result = await FilePicker.pickFiles({
    types: ["application/json", "text/*"],
    limit: 1,
    readData: true,
  });
  const file = result.files[0];
  if (!file) return null;
  if (file.data) return atob(file.data);
  if (file.path) {
    const r = await Filesystem.readFile({
      path: file.path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return r.data as string;
  }
  return null;
}

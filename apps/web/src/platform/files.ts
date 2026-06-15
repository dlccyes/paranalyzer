function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener(
      "change",
      () => {
        const picked = input.files?.[0] ?? null;
        input.remove();
        resolve(picked);
      },
      { once: true },
    );
    input.click();
  });
}

function pickFiles(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener(
      "change",
      () => {
        const files = Array.from(input.files ?? []);
        input.remove();
        resolve(files);
      },
      { once: true },
    );
    input.click();
  });
}

export async function webPickTrackFiles(): Promise<{ name: string; text: string }[]> {
  const files = await pickFiles(".igc,.gpx,.kml,application/octet-stream,text/plain");
  const results: { name: string; text: string }[] = [];
  for (const file of files) {
    const text = await file.text();
    results.push({ name: file.name, text });
  }
  return results;
}

export async function webSaveBackupFile(name: string, json: string): Promise<void> {
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

export async function webPickBackupFile(): Promise<string | null> {
  const file = await pickFile("application/json,.json,text/*");
  if (!file) return null;
  return file.text();
}

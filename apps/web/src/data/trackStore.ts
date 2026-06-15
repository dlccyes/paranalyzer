const TRACK_PREFIX = "paranalyzer-track:";

export async function saveTrack(id: string, ext: string, text: string): Promise<string> {
  const ref = `tracks/${id}.${ext}`;
  localStorage.setItem(TRACK_PREFIX + ref, text);
  return ref;
}

export async function readTrack(trackRef: string): Promise<string> {
  const text = localStorage.getItem(TRACK_PREFIX + trackRef);
  if (!text) throw new Error(`Track not found: ${trackRef}`);
  return text;
}

export async function deleteTrack(trackRef: string): Promise<void> {
  localStorage.removeItem(TRACK_PREFIX + trackRef);
}

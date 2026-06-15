import { getPlatform } from "../platform";

export function saveTrack(id: string, ext: string, text: string): Promise<string> {
  return getPlatform().tracks.saveTrack(id, ext, text);
}

export function readTrack(ref: string): Promise<string> {
  return getPlatform().tracks.readTrack(ref);
}

export function deleteTrack(ref: string): Promise<void> {
  return getPlatform().tracks.deleteTrack(ref);
}

export function canShowThumbnail(src: string): boolean {
  if (!src || src.startsWith("//")) return false;
  if (src.startsWith("data:image/")) return true;
  if (src.startsWith("/")) return true;
  try {
    return new URL(src).origin === window.location.origin;
  } catch {
    return false;
  }
}

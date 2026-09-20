// Turning a picture someone chose into something a tag can carry.
//
// The picture is cropped square, shrunk and stored as a data URL inside the tag
// itself. That keeps it working offline, syncing like every other edit and
// needing no upload endpoint - but it also means it travels to every device, so
// it is kept small and deliberately capped.
const SIDE = 160; // stored square: a 40px circle stays sharp on a 4x screen
const MAX_BYTES = 90_000;
const STEPS: { side: number; quality: number }[] = [
  { side: SIDE, quality: 0.82 },
  { side: SIDE, quality: 0.68 },
  { side: 128, quality: 0.68 },
  { side: 96, quality: 0.6 },
];

export const MAX_PICTURE_BYTES = 20 * 1024 * 1024;

/** Whether a dropped or pasted file is something we can make a tag picture from. */
export const isPicture = (file: File | null | undefined): file is File =>
  !!file && file.type.startsWith('image/') && file.size <= MAX_PICTURE_BYTES;

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('that file is not an image the browser can read'));
    };
    img.src = url;
  });
}

/**
 * A square data URL of the middle of `file`. WebP where the browser writes it,
 * JPEG otherwise; either way small enough to live in a document that syncs.
 */
export async function squarePicture(file: File): Promise<string> {
  const img = await load(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error('that image has no size');
  // Take the middle square, so a portrait or a wide photo both crop sensibly.
  const crop = Math.min(w, h);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('this browser cannot resize images');
  ctx.imageSmoothingQuality = 'high';

  let last = '';
  for (const step of STEPS) {
    const side = Math.min(step.side, crop);
    canvas.width = side;
    canvas.height = side;
    ctx.clearRect(0, 0, side, side);
    ctx.drawImage(img, (w - crop) / 2, (h - crop) / 2, crop, crop, 0, 0, side, side);
    last = canvas.toDataURL('image/webp', step.quality);
    // A browser that cannot write WebP hands back a PNG; JPEG is the better fallback.
    if (!last.startsWith('data:image/webp')) last = canvas.toDataURL('image/jpeg', step.quality);
    if (last.length <= MAX_BYTES) return last;
  }
  throw new Error('that picture would not shrink enough — try a simpler one');
}

/** The picture in a paste or a drop, if there is one. */
export function pictureFrom(data: DataTransfer | null | undefined): File | null {
  for (const item of data?.files ?? []) if (isPicture(item)) return item;
  return null;
}

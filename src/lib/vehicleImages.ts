import suzukiDzire from '@/assets/vehicles/suzuki-dzire.png';
import suzukiAlto from '@/assets/vehicles/suzuki-alto.png';
import suzukiCarry from '@/assets/vehicles/suzuki-carry.png';

/**
 * Maps a vehicle model name to a branded default image asset.
 * Returns null when no preset matches; callers should fall back to placeholder UI.
 */
export function getVehicleModelImage(modelName?: string | null): string | null {
  if (!modelName) return null;
  const m = modelName.toLowerCase();
  if (m.includes('dzire')) return suzukiDzire;
  if (m.includes('alto')) return suzukiAlto;
  if (m.includes('carry')) return suzukiCarry;
  return null;
}

/**
 * Resolves the best image to display for a vehicle:
 * uploaded image_url first, otherwise a branded model preset.
 */
export function resolveVehicleImage(
  imageUrl?: string | null,
  modelName?: string | null,
): string | null {
  if (imageUrl) return imageUrl;
  return getVehicleModelImage(modelName);
}

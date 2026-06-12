import { describe, expect, it } from 'vitest';
import {
  formatDueDateRelative,
  requiredZones,
  PHOTO_ZONES,
  DOCUMENT_ZONES,
} from './fleetControl';

describe('formatDueDateRelative', () => {
  const now = new Date(2026, 5, 12, 14, 30); // 12 juin 2026, 14h30 local

  it('says "Échéance dans X jours" for future due dates', () => {
    expect(formatDueDateRelative(new Date(2026, 5, 17), now)).toBe('Échéance dans 5 jours');
    expect(formatDueDateRelative(new Date(2026, 5, 26), now)).toBe('Échéance dans 14 jours');
  });

  it('uses the singular for 1 day', () => {
    expect(formatDueDateRelative(new Date(2026, 5, 13), now)).toBe('Échéance dans 1 jour');
    expect(formatDueDateRelative(new Date(2026, 5, 11), now)).toBe('En retard de 1 jour');
  });

  it('says "À soumettre aujourd\'hui" on the due day, regardless of the hour', () => {
    expect(formatDueDateRelative(new Date(2026, 5, 12, 0, 5), now)).toBe("À soumettre aujourd'hui");
    expect(formatDueDateRelative(new Date(2026, 5, 12, 23, 55), now)).toBe("À soumettre aujourd'hui");
  });

  it('says "En retard de X jours" for past due dates', () => {
    expect(formatDueDateRelative(new Date(2026, 5, 9), now)).toBe('En retard de 3 jours');
  });

  it('accepts ISO strings', () => {
    expect(formatDueDateRelative(new Date(2026, 5, 15).toISOString(), now)).toBe('Échéance dans 3 jours');
  });
});

describe('requiredZones', () => {
  it('requires all 11 zones when both settings are on (default)', () => {
    const zones = requiredZones({ require_all_photos: true, require_documents: true });
    expect(zones).toHaveLength(11);
    expect(zones.filter((z) => z.kind === 'photo')).toHaveLength(PHOTO_ZONES.length);
    expect(zones.filter((z) => z.kind === 'document')).toHaveLength(DOCUMENT_ZONES.length);
  });

  it('requires only the 7 photos when documents are optional', () => {
    const zones = requiredZones({ require_all_photos: true, require_documents: false });
    expect(zones.map((z) => z.key)).toEqual(PHOTO_ZONES.map((z) => z.key));
  });

  it('requires only the 4 documents when photos are optional', () => {
    const zones = requiredZones({ require_all_photos: false, require_documents: true });
    expect(zones.map((z) => z.key)).toEqual(DOCUMENT_ZONES.map((z) => z.key));
  });

  it('never allows an empty submission: both flags off falls back to the 7 photos', () => {
    const zones = requiredZones({ require_all_photos: false, require_documents: false });
    expect(zones.map((z) => z.key)).toEqual(PHOTO_ZONES.map((z) => z.key));
  });
});

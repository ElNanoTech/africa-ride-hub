import { describe, it, expect } from 'vitest';
import { csvCell } from './export';

describe('csvCell', () => {
  it('passes plain strings through', () => {
    expect(csvCell('Jean Dupont')).toBe('Jean Dupont');
  });

  it('returns empty string for null/undefined', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes values containing commas', () => {
    expect(csvCell('Abidjan, Cocody')).toBe('"Abidjan, Cocody"');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(csvCell('dit "ok"')).toBe('"dit ""ok"""');
  });

  it('quotes values containing newlines', () => {
    expect(csvCell('ligne1\nligne2')).toBe('"ligne1\nligne2"');
  });

  describe('formula injection', () => {
    it.each(['=', '+', '-', '@'])('neutralizes strings starting with %s', (ch) => {
      expect(csvCell(`${ch}cmd()`)).toBe(`'${ch}cmd()`);
    });

    it('neutralizes the classic =HYPERLINK payload', () => {
      expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(
        `"'=HYPERLINK(""http://evil"",""x"")"`,
      );
    });

    it('neutralizes injection AND keeps quoting when a comma is present', () => {
      expect(csvCell('=1+1,2')).toBe(`"'=1+1,2"`);
    });

    it('does NOT touch numbers (negative numbers stay numeric)', () => {
      expect(csvCell(-5)).toBe('-5');
      expect(csvCell(0)).toBe('0');
      expect(csvCell(1234.5)).toBe('1234.5');
    });

    it('does not touch strings merely containing = elsewhere', () => {
      expect(csvCell('a=b')).toBe('a=b');
    });
  });
});

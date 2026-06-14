import { describe, expect, it } from 'vitest';
import { normalizeSpeechText, splitSpeechIntoChunks } from './naturalSpeech';

describe('naturalSpeech', () => {
  it('turns finance UI text into easier spoken French', () => {
    expect(
      normalizeSpeechText(
        'Votre solde KiraPay est de 16 000 FCFA. Il reste FAC-TEST-2026-000002 a regler.',
      ),
    ).toBe(
      'Votre solde Kira Pay est de 16 000 francs CFA. Il reste facture numéro 000002 à régler.',
    );
  });

  it('splits long speech into short chunks', () => {
    const chunks = splitSpeechIntoChunks(
      'Bonjour. Votre portefeuille est disponible maintenant. Une facture demande votre attention. Merci.',
      60,
    );

    expect(chunks).toEqual([
      'Bonjour. Votre portefeuille est disponible maintenant.',
      'Une facture demande votre attention. Merci.',
    ]);
  });
});

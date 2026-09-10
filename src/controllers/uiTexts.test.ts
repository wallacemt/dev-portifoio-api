import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { getUiTexts, SUPPORTED_LANGUAGES } from '../i18n';
import { UtilisController } from './utilisController';

const app = express().use('/utilis', new UtilisController().routerPublic);

describe('static landing and video UI text contexts', () => {
  for (const language of SUPPORTED_LANGUAGES) {
    for (const context of ['landing', 'videos']) {
      it(`serves the complete ${context} catalog in ${language}`, async () => {
        const response = await request(app)
          .get('/utilis/ui-texts')
          .query({ context, language });
        expect(response.status).toBe(200);
        expect(response.body).toEqual(getUiTexts(context, language));
        expect(
          Object.values(response.body).every(
            (value) => typeof value === 'string' && value.length > 0
          )
        ).toBe(true);
      });
    }
  }
  it('keeps Portuguese, English and French distinct', () => {
    expect(getUiTexts('landing', 'pt').latestVideoTitle).toBe('Último vídeo');
    expect(getUiTexts('landing', 'en').latestVideoTitle).toBe('Latest video');
    expect(getUiTexts('landing', 'fr').latestVideoTitle).toBe('Dernière vidéo');
    expect(getUiTexts('videos', 'fr').empty).toBe('Aucune vidéo trouvée.');
  });
  it('rejects unknown contexts and non-scalar language parameters', async () => {
    const responses = await Promise.all([
      request(app).get('/utilis/ui-texts').query({ context: 'owner' }),
      request(app)
        .get('/utilis/ui-texts')
        .query({ context: 'videos', language: ['en', 'fr'] }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([400, 400]);
  });
});

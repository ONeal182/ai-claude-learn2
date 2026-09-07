import { DEFAULT_STT_ENGINE, resolveSttEngine } from './stt-engine.js';

/**
 * `resolveSttEngine` — единая нормализация `STT_ENGINE` для фабрики `STT_SERVICE` и `validateEnv`.
 * Раньше стороны расходились (`||`+trim vs `??`): пустая строка роняла фабрику `Unknown STT_ENGINE`.
 */
describe('resolveSttEngine', () => {
  it('пусто / undefined / пробелы → DEFAULT_STT_ENGINE', () => {
    expect(resolveSttEngine(undefined)).toBe(DEFAULT_STT_ENGINE);
    expect(resolveSttEngine('')).toBe(DEFAULT_STT_ENGINE);
    expect(resolveSttEngine('   ')).toBe(DEFAULT_STT_ENGINE);
    expect(resolveSttEngine('\n')).toBe(DEFAULT_STT_ENGINE);
  });

  it('валидные значения (с обрезкой пробелов)', () => {
    expect(resolveSttEngine('whisper')).toBe('whisper');
    expect(resolveSttEngine('stub')).toBe('stub');
    expect(resolveSttEngine('  whisper  ')).toBe('whisper');
  });

  it('неизвестное значение → Error (типоопечатка не должна тихо стать дефолтом)', () => {
    expect(() => resolveSttEngine('wisper')).toThrow(/Unknown STT_ENGINE/);
    expect(() => resolveSttEngine('WHISPER')).toThrow(/Unknown STT_ENGINE/);
  });
});

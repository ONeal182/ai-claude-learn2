import { buildFfmpegArgs, buildWhisperArgs, needsConversion } from './whisper-command.js';

describe('whisper-command', () => {
  describe('buildWhisperArgs', () => {
    it('пустой язык → -l auto; порядок: -m модель, -l язык, -nt, -f вход', () => {
      expect(
        buildWhisperArgs({ inputPath: '/tmp/a.wav', modelPath: '/m/tiny.bin', language: '' }),
      ).toEqual(['-m', '/m/tiny.bin', '-l', 'auto', '-nt', '-f', '/tmp/a.wav']);
    });

    it('язык с пробелами обрезается', () => {
      const args = buildWhisperArgs({
        inputPath: '/tmp/a.wav',
        modelPath: '/m.bin',
        language: ' ru ',
      });
      expect(args[args.indexOf('-l') + 1]).toBe('ru');
    });
  });

  describe('needsConversion', () => {
    it('WAV mime → конвертация не нужна', () => {
      expect(needsConversion('audio/wav')).toBe(false);
      expect(needsConversion('audio/x-wav')).toBe(false);
    });

    it('любой не-WAV mime → нужна конвертация', () => {
      for (const mime of [
        'audio/mpeg',
        'audio/mp4',
        'audio/webm',
        'audio/ogg',
        'video/mp4',
        'video/quicktime',
      ]) {
        expect(needsConversion(mime)).toBe(true);
      }
    });
  });

  describe('buildFfmpegArgs', () => {
    it('приводит вход к 16 кГц моно 16-bit PCM WAV с перезаписью выхода', () => {
      expect(buildFfmpegArgs('/in/call.mp3', '/tmp/x/input.wav')).toEqual([
        '-i',
        '/in/call.mp3',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        '-y',
        '/tmp/x/input.wav',
      ]);
    });
  });
});

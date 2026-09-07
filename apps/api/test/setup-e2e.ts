// e2e всегда идёт на stub-двойнике STT (через `.overrideProvider(STT_SERVICE)`): реальный
// whisper.cpp/ffmpeg в CI и pre-commit не нужны. Объявляем движок в окружении до подъёма
// AppModule, чтобы `validateEnv` не сыпал warn на каждом `beforeEach`. Явно заданный
// `STT_ENGINE` (напр. в CI) не трогаем.
process.env.STT_ENGINE ??= 'stub';

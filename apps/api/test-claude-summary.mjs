#!/usr/bin/env node
import 'dotenv/config';

// Test Claude Agent SDK directly
async function testClaudeSummary() {
  console.log('Environment variables:');
  console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'set' : 'not set');
  console.log('ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL);
  console.log('SUMMARY_ENGINE:', process.env.SUMMARY_ENGINE);
  console.log();

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    console.log('✅ Claude Agent SDK loaded successfully');

    const testPrompt = `Ты — ассистент по суммаризации транскриптов встреч. Проанализируй транскрипт и верни результат СТРОГО в формате JSON без дополнительных пояснений.

Транскрипт:
=== Файл 1: audio_2026-09-08_16-29-53.wav ===
еще одна проверка номер 2. Проверка Голосового и транскрипции.

=== Файл 2: audio_2026-09-08_15-55-01.wav ===
Проверка раз 2,3 по году гавано, кот полная гавано, непонятно вообще чем делаться.

=== Файл 3: audio_2026-09-08_16-29-53.wav ===
еще одна проверка номер 2. Проверка Голосового и транскрипции.

Верни JSON в формате:
{
  "summary": "Краткое резюме встречи",
  "decisions": ["Решение 1", "Решение 2"],
  "actionItems": ["Задача 1", "Задача 2"]
}`;

    console.log('Starting Claude Agent query...');
    console.log();

    const options = {
      model: 'claude-haiku-4-5',
      maxTurns: 1,
      tools: [],
      settingSources: [],
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      },
    };

    for await (const message of query({ prompt: testPrompt, options })) {
      if (message.type === 'result') {
        console.log('Result:', JSON.stringify(message, null, 2));

        if (message.subtype === 'success') {
          console.log('\n✅ Summary generated successfully:');
          console.log(message.result);
        } else {
          console.log('\n❌ Error:', message.errors);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testClaudeSummary();

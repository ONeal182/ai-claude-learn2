/**
 * Тест Claude Agent SDK с переменными окружения из .env
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env
dotenv.config({ path: join(__dirname, '.env') });

console.log('Environment variables:');
console.log(
  'ANTHROPIC_API_KEY:',
  process.env.ANTHROPIC_API_KEY
    ? 'SET (length: ' + process.env.ANTHROPIC_API_KEY.length + ')'
    : 'NOT SET',
);
console.log('ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL || 'NOT SET');
console.log('');

async function testClaudeAgent() {
  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    console.log('Testing Claude Agent SDK...');

    const prompt = 'Say hello and tell me what 2+2 is';

    for await (const message of query({
      prompt,
      options: {
        model: 'claude-haiku-4-5',
        maxTurns: 1,
        tools: [],
        settingSources: [],
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
          ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
        },
      },
    })) {
      console.log('Message:', JSON.stringify(message, null, 2));

      if (message.type === 'result') {
        console.log('\nFinal result:');
        console.log('- subtype:', message.subtype);
        console.log('- is_error:', message.is_error);
        console.log('- result:', message.result);
        console.log('- errors:', message.errors);
        console.log('- num_turns:', message.num_turns);
        console.log('- cost:', '$' + message.total_cost_usd.toFixed(4));
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

testClaudeAgent();

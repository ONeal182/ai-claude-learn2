#!/usr/bin/env node
// Форматирует stream-json от `claude -p --output-format stream-json --verbose`
// в читаемую построчную трассировку хода работы (для tail -f ralph.log).
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }

  if (event.type === 'result') {
    const status = event.is_error ? '❌ ЗАВЕРШЕНО С ОШИБКОЙ' : '✅ Завершено';
    console.log(`\n${status} (turns: ${event.num_turns}, ${event.duration_ms}ms)`);
    if (event.is_error && event.result) {
      console.log(`   ${String(event.result).slice(0, 500)}`);
    }
    return;
  }

  const content = event.message && Array.isArray(event.message.content) ? event.message.content : [];
  for (const block of content) {
    if (block.type === 'text' && block.text && block.text.trim()) {
      console.log(`\n💬 ${block.text.trim()}`);
    } else if (block.type === 'tool_use') {
      console.log(`🔧 ${block.name} ${JSON.stringify(block.input ?? {}).slice(0, 200)}`);
    } else if (block.type === 'tool_result') {
      const raw = Array.isArray(block.content)
        ? block.content.map((c) => c.text ?? '').join(' ')
        : String(block.content ?? '');
      console.log(`   ${block.is_error ? '❌' : '✅'} ${raw.slice(0, 200).replace(/\n/g, ' ')}`);
    }
  }
});

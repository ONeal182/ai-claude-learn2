#!/usr/bin/env node
// Форматирует stream-json от `claude -p --output-format stream-json --verbose`
// в читаемую построчную трассировку хода работы (для tail -f ralph.log).
//
// Дополнительно: из финального события `result` достаёт расход токенов и
// стоимость прогона, печатает их строкой `📊 ...` и — если задан
// RALPH_SESSION_FILE — пишет туда JSON {session_id, usage, total_cost_usd,
// num_turns, is_error}. ralph-loop.js читает этот файл, чтобы суммировать
// расход по milestone и за весь прогон.
const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({ input: process.stdin });

function fmtTok(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(v);
}

rl.on('line', (line) => {
  if (!line.trim()) return;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }

  if (event.type === 'result') {
    const u = event.usage || {};
    const cost = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null;
    const stats = [
      `turns: ${event.num_turns}`,
      `${Math.round((event.duration_ms || 0) / 1000)}s`,
      `in ${fmtTok(u.input_tokens)}`,
      `out ${fmtTok(u.output_tokens)}`,
      `cache ${fmtTok(u.cache_read_input_tokens)}r/${fmtTok(u.cache_creation_input_tokens)}w`,
      cost != null ? `$${cost.toFixed(2)}` : null,
    ].filter(Boolean);
    const status = event.is_error ? '❌ ЗАВЕРШЕНО С ОШИБКОЙ' : '✅ Завершено';
    console.log(`\n${status} · 📊 ${stats.join(' · ')}`);
    if (event.is_error && event.result) {
      console.log(`   ${String(event.result).slice(0, 500)}`);
    }
    if (process.env.RALPH_SESSION_FILE) {
      try {
        fs.writeFileSync(
          process.env.RALPH_SESSION_FILE,
          JSON.stringify({
            session_id: event.session_id ?? null,
            usage: u,
            total_cost_usd: cost,
            num_turns: event.num_turns ?? null,
            is_error: !!event.is_error,
          }),
        );
      } catch {
        /* сайдбенд-файл необязателен — молча пропускаем */
      }
    }
    return;
  }

  const content =
    event.message && Array.isArray(event.message.content) ? event.message.content : [];
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

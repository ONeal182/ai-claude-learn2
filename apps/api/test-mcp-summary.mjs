#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Test Claude summary with MCP tools
async function testWithMcpTools() {
  const prisma = new PrismaClient();

  try {
    console.log('Testing Claude summary with MCP tools...\n');

    // Import services
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const { createMeetingMcpServer } = await import('./dist/claude-agent/meeting-tools.js');
    const { TaskService } = await import('./dist/task/task.service.js');

    const taskService = new TaskService(prisma);
    const meetingId = 'cmtt5tq990003eze0oxdjm8b2';

    // Create MCP server
    console.log('Creating MCP server...');
    const mcpServer = await createMeetingMcpServer(prisma, taskService, meetingId);
    console.log('✅ MCP server created\n');

    const systemPrompt = `Ты — ассистент по суммаризации транскриптов встреч. Проанализируй транскрипт и верни результат СТРОГО в формате JSON без дополнительных пояснений, комментариев или markdown-разметки.

Формат ответа:
{
  "summary": "Краткое резюме встречи (1-2 абзаца на русском языке)",
  "decisions": ["Решение 1", "Решение 2", ...],
  "actionItems": ["Задача 1", "Задача 2", ...]
}

У тебя есть доступ к инструментам:
- find_tasks(query) — поиск похожих задач
- upsert_task(title, status, id?) — создание или обновление задачи
- update_meeting(summary, decisions) — сохранение итогов встречи

Правило работы с задачами:
1. Перед созданием задачи вызови find_tasks с ключевыми словами из actionItem
2. Если похожая задача найдена — обнови её через upsert_task с её id
3. Если похожих нет — создай новую через upsert_task без id
4. После создания/обновления всех задач, сохрани резюме встречи через update_meeting`;

    const transcriptText = `=== Файл 1: audio_2026-09-08_16-29-53.wav ===
еще одна проверка номер 2. Проверка Голосового и транскрипции.

=== Файл 2: audio_2026-09-08_15-55-01.wav ===
Проверка раз 2,3 по году гавано, кот полная гавано, непонятно вообще чем делаться.

=== Файл 3: audio_2026-09-08_16-29-53.wav ===
еще одна проверка номер 2. Проверка Голосового и транскрипции.`;

    const options = {
      model: 'claude-haiku-4-5',
      maxTurns: 10,
      systemPrompt,
      tools: [mcpServer],
      settingSources: [],
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      },
    };

    console.log('Starting Claude Agent query with MCP tools...\n');

    for await (const message of query({ prompt: transcriptText, options })) {
      if (message.type === 'assistant') {
        console.log('Assistant:', message);
      }

      if (message.type === 'result') {
        console.log('\n=== RESULT ===');
        console.log('Subtype:', message.subtype);
        console.log('Is Error:', message.is_error);
        console.log('Num Turns:', message.num_turns);

        if (message.subtype === 'success') {
          console.log('\n✅ Response:');
          console.log(message.result);

          // Try to parse
          let jsonText = message.result.trim();
          const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
          if (codeBlockMatch) {
            jsonText = codeBlockMatch[1].trim();
          }

          try {
            const parsed = JSON.parse(jsonText);
            console.log('\n✅ Parsed JSON:');
            console.log(JSON.stringify(parsed, null, 2));
          } catch (e) {
            console.log('\n❌ Failed to parse JSON:', e.message);
            console.log('Raw text:', jsonText);
          }
        } else {
          console.log('\n❌ Errors:', message.errors);
        }
      }
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testWithMcpTools();

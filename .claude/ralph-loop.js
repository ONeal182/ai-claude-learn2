#!/usr/bin/env node
// Внешний оркестратор Ralph loop.
//
// Запускать НАПРЯМУЮ пользователем (не как Claude Code hook):
//   node .claude/ralph-loop.js              # id майлстонов берутся из ralph.config.json
//   node .claude/ralph-loop.js 5 6 7        # id майлстонов из аргументов (переопределяют конфиг)
//   nohup node .claude/ralph-loop.js 5 6 > ralph.log 2>&1 &   # в фоне
//
// Milestone задаётся ЧИСЛОВЫМ id (number из URL майлстона / `gh api .../milestones`),
// а НЕ названием. Можно передать несколько id — они обрабатываются строго
// последовательно: для каждого создаётся своя ветка вида
// `feature/<англ-slug>-phase-<номер фазы>` (номер фазы — из названия "Фаза N:",
// slug — перевод названия на английский через claude -p, кэш в
// ralph-branch-names.json) от baseBranch, гоняется цикл по его открытым issue,
// а после закрытия последней issue создаётся отдельный PR и запускается
// детальное code review на opus. Затем оркестратор переходит к следующему id.
// maxIterations — лимит на КАЖДЫЙ milestone (счётчик сбрасывается при переходе
// к следующему).
//
// Экономия токенов:
//  - code review двумя субагентами — ОДИН раз на фазу (тут), а не на каждую
//    issue (см. .claude/ralph.md);
//  - API-фазам и ревью PR браузер не нужен → --strict-mcp-config, схемы
//    Playwright MCP не грузятся (см. needsBrowser / browserMilestones);
//  - issue одной фазы идут в общей сессии claude (--session-id + --resume),
//    контекст и прочитанные файлы не остывают между issue;
//  - расход токенов/стоимость каждого прогона claude берётся из stream-json
//    (ralph-format.js) и суммируется по фазе и за весь прогон.
//
// Устойчивость (не всякий ненулевой exit фатален):
//  - у каждого прогона claude есть таймаут (iterationTimeoutMin); таймаут и
//    крах/транзиент API ретраятся (maxRetries) с паузой;
//  - исчерпание --max-turns НЕ ошибка: прогресс, как правило, закоммичен —
//    issue продолжается в следующей итерации (лимит maxContinuationsPerIssue);
//  - после каждой итерации — гейт verifyCmd (lint/typecheck/test) + проверка,
//    что нет незакоммиченного: красно → issue переоткрывается, прогон встаёт;
//  - git push и gh pr create обёрнуты: push с ретраями, оба при провале —
//    чистая остановка с инструкцией, а не сырой стектрейс.
//
// Claude Code hooks (Stop и т.п.) ограничены по времени выполнения (по
// умолчанию порядка минуты) и не предназначены для синхронного ожидания
// целого вложенного `claude -p` прогона в десятки минут — попытка сделать
// это внутри Stop hook приводит к его убийству харнесом и неконтролируемой
// рекурсии дочерних сессий (settings.json действует и на вложенные claude -p,
// так что их завершение снова триггерит Stop hook). Поэтому цикл живёт здесь,
// как обычный процесс вне системы хуков.
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'ralph.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const {
  baseBranch = 'main',
  branchPrefix = 'feature/',
  maxIterations,
  maxTurns,
  // Бюджет ходов для веб-фаз (Playwright + проверка UI съедают больше).
  browserMaxTurns = maxTurns,
  // Ручной форс браузера для конкретных фаз. Обычно НЕ нужен: решение и так
  // берётся из названия фазы и её issue (см. needsBrowser). Оставь [] —
  // список нужен только если эвристика по названию промахивается.
  browserMilestones = [],
  // Точечный оверрайд бюджета ходов: { "<id>": 70 }.
  maxTurnsOverrides = {},
  // Все issue одной фазы гоняются в одной сессии claude (--resume): контекст
  // и уже прочитанные файлы остаются прогретыми между issue. Сброс на новой фазе.
  resumeWithinMilestone = true,
  // Гейт качества после каждой итерации. Красный гейт (или незакоммиченные
  // правки) => issue переоткрывается, прогон останавливается — дальше не идём.
  verify = true,
  verifyCmd = 'pnpm lint && pnpm typecheck && pnpm test',
  // Таймаут одного прогона claude (мин). По истечении процесс убивается,
  // сбой классифицируется как транзиентный и ретраится.
  iterationTimeoutMin = 45,
  // Ретраи, когда claude не завершился штатно (таймаут / краш / транзиент API).
  // Исчерпание --max-turns и claude-репорт об ошибке НЕ ретраятся.
  maxRetries = 2,
  retryDelaySec = 30,
  // Сколько раз подряд продолжать одну issue (после исчерпания ходов), пока
  // гейт зелёный, прежде чем остановиться с явным сообщением.
  maxContinuationsPerIssue = 2,
} = config;

// Сайдбенд-файл: ralph-format.js пишет сюда расход токенов/стоимость последнего
// прогона claude, оркестратор читает и суммирует. Вне git (в .gitignore).
const sessionInfoPath = path.join(__dirname, 'ralph-session.json');

// Кэш переведённых slug'ов для имён веток. ОТДЕЛЬНЫЙ файл вне git (в .gitignore):
// оркестратор пишет его прямо во время прогона, а трогать в этот момент
// закоммиченный файл нельзя — иначе следующий `git checkout` между майлстоунами
// падает на "local changes would be overwritten".
const branchCachePath = path.join(__dirname, 'ralph-branch-names.json');
const branchNameCache = fs.existsSync(branchCachePath)
  ? JSON.parse(fs.readFileSync(branchCachePath, 'utf8'))
  : {};

// id майлстонов: аргументы командной строки важнее поля "milestones" в конфиге.
const cliIds = process.argv.slice(2);
const rawIds = cliIds.length > 0 ? cliIds : (config.milestones ?? []);
const milestoneIds = rawIds.map((v) => Number(String(v).trim()));

if (milestoneIds.length === 0) {
  const hint = config.milestone
    ? ' (поле "milestone" со строкой-названием больше не поддерживается — используйте "milestones": [<id>, ...] или аргументы командной строки)'
    : '';
  console.error(
    'Не заданы milestone id: передайте их аргументами (node .claude/ralph-loop.js 5 6) ' +
      `или полем "milestones" в .claude/ralph.config.json${hint}`,
  );
  process.exit(1);
}
if (milestoneIds.some((n) => !Number.isInteger(n) || n <= 0)) {
  console.error(
    `milestone id должны быть положительными целыми числами, получено: ${rawIds.join(', ')}`,
  );
  process.exit(1);
}
if (!maxIterations || !maxTurns) {
  console.error('ralph.config.json: не заданы maxIterations / maxTurns');
  process.exit(1);
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function runOut(cmd) {
  return execSync(cmd, { encoding: 'utf8' });
}

const formatterPath = path.join(__dirname, 'ralph-format.js');

const SKIP_FLAG = '--dangerously-skip-permissions';

// Гоняет `claude -p` с построчным стримом (--output-format stream-json --verbose)
// через ralph-format.js, чтобы в ralph.log было видно ход работы по шагам,
// а не только финальный ответ по завершении итерации. `set -o pipefail` в
// bash нужен, чтобы код выхода claude (а не форматтера) долетал до нас.
//
// opts:
//   turns      — --max-turns (число); пропустить для безлимита
//   model      — --model (напр. 'claude-opus-5')
//   sessionId  — UUID: на первом прогоне фазы → --session-id (фиксируем id),
//                на последующих с resume:true → --resume (продолжаем ту же сессию)
//   resume     — true → --resume sessionId вместо --session-id
//   noBrowser  — true → --strict-mcp-config: не поднимать Playwright MCP
//                (для API-фаз и ревью PR схемы browser_* в контексте — лишний расход)
//   timeoutMin — таймаут прогона (мин), по умолчанию iterationTimeoutMin
//
// НЕ бросает на сбой подпроцесса — возвращает объект:
//   { ok, info, err, timedOut, sessionExists }
//   info          — распарсенный сайдбенд (usage/cost/num_turns/is_error) либо null
//   timedOut      — прибит по таймауту
//   sessionExists — claude успел создать сессию (сайдбенд записан) — ретраить через --resume
function runClaudeStreamed(prompt, opts = {}) {
  const { turns, model, sessionId, resume, noBrowser, timeoutMin } = opts;
  const flags = ['--output-format stream-json', '--verbose', SKIP_FLAG];
  if (model) flags.push(`--model ${model}`);
  if (typeof turns === 'number') flags.push(`--max-turns ${turns}`);
  if (sessionId && resume) flags.push(`--resume ${sessionId}`);
  else if (sessionId) flags.push(`--session-id ${sessionId}`);
  if (noBrowser) flags.push('--strict-mcp-config');

  try {
    fs.rmSync(sessionInfoPath, { force: true });
  } catch {
    /* нет файла — ок */
  }

  // `timeout` CLI прибивает именно claude (SIGTERM, затем SIGKILL через 30s) —
  // надёжнее таймаута execSync, который шлёт сигнал bash, а тот не всегда
  // пробрасывает его в claude (процесс осиротеет и продолжит жечь токены).
  // Код выхода при таймауте — 124. execSync-таймаут оставлен как страховка выше.
  const tSec = Math.round((timeoutMin ?? iterationTimeoutMin) * 60);
  const cmd =
    `set -o pipefail; timeout --kill-after=30s ${tSec}s ` +
    `claude -p ${JSON.stringify(prompt)} ${flags.join(' ')} | node ${JSON.stringify(formatterPath)}`;
  try {
    execSync(cmd, {
      stdio: 'inherit',
      shell: '/bin/bash',
      timeout: (tSec + 120) * 1000,
      killSignal: 'SIGKILL',
      env: { ...process.env, RALPH_SESSION_FILE: sessionInfoPath },
    });
    return { ok: true, info: readRunInfo(), sessionExists: true };
  } catch (err) {
    const info = readRunInfo();
    const timedOut =
      err.status === 124 || err.status === 137 || err.killed === true || err.code === 'ETIMEDOUT';
    const already = /session id .*already|already in use|already exists/i.test(
      `${err.message}${err.stderr || ''}`,
    );
    return { ok: false, info, err, timedOut, sessionExists: !!info || already };
  }
}

// Читает расход последнего прогона claude из сайдбенд-файла (пишет ralph-format.js).
function readRunInfo() {
  try {
    return JSON.parse(fs.readFileSync(sessionInfoPath, 'utf8'));
  } catch {
    return null;
  }
}

function fmtTok(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(v);
}

function addUsage(acc, info) {
  if (!info) return;
  const u = info.usage || {};
  acc.usd += Number(info.total_cost_usd) || 0;
  acc.in += Number(u.input_tokens) || 0;
  acc.out += Number(u.output_tokens) || 0;
  acc.cacheRead += Number(u.cache_read_input_tokens) || 0;
  acc.cacheWrite += Number(u.cache_creation_input_tokens) || 0;
  acc.runs += 1;
}

function fmtUsage(acc) {
  return (
    `$${acc.usd.toFixed(2)} · in ${fmtTok(acc.in)} · out ${fmtTok(acc.out)} · ` +
    `cache ${fmtTok(acc.cacheRead)}r/${fmtTok(acc.cacheWrite)}w · прогонов ${acc.runs}`
  );
}

function newUsageAcc() {
  return { usd: 0, in: 0, out: 0, cacheRead: 0, cacheWrite: 0, runs: 0 };
}

const grandTotal = newUsageAcc();

// Синхронная пауза (скрипт целиком синхронный).
function sleepSec(s) {
  try {
    execSync(`sleep ${Number(s) || 0}`, { stdio: 'ignore' });
  } catch {
    /* прервали — ок */
  }
}

// Чистая остановка: сообщение + ненулевой код. Дальше по майлстонам не идём.
function safeStop(msg) {
  console.error(`\n🛑 ${msg}`);
  process.exit(1);
}

// Есть ли незакоммиченные правки в ОТСЛЕЖИВАЕМЫХ файлах (untracked не в счёт —
// это обычно артефакты вроде скриншотов проверки UI).
function hasUncommittedTrackedChanges() {
  return runOut('git status --porcelain')
    .split('\n')
    .some((l) => l.trim() && !l.startsWith('??'));
}

// Гейт качества после итерации. Вывод глушим, при красном печатаем хвост.
function verifyGate() {
  if (!verify) return true;
  console.log(`🔍 Гейт: ${verifyCmd}`);
  try {
    execSync(verifyCmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: '/bin/bash',
      timeout: 15 * 60_000,
    });
    console.log('   ✅ зелёно');
    return true;
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`.trim();
    console.error(`   ❌ красно:\n${out.split('\n').slice(-40).join('\n')}`);
    return false;
  }
}

// Пуш ветки в origin с ретраями на транзиентных сбоях. Если не вышло за
// maxRetries+1 попыток — чистая остановка (ветку мог кто-то двигать и т.п.).
function pushBranchSafe(branch) {
  for (let attempt = 1; ; attempt++) {
    try {
      run(`git push -u origin ${JSON.stringify(branch)}`);
      return;
    } catch (err) {
      if (attempt > maxRetries) {
        safeStop(
          `git push ветки ${branch} не удался после ${attempt} попыток:\n${err.message}\n` +
            `Разберитесь вручную и перезапустите скрипт.`,
        );
      }
      console.error(
        `⚠️  git push (попытка ${attempt}/${maxRetries + 1}) не удался, повтор через ${retryDelaySec}s…`,
      );
      sleepSec(retryDelaySec);
    }
  }
}

// Признаки фронтенд-задачи в названии (→ проверка в браузере через Playwright MCP).
// \b ненадёжен с кириллицей в JS-регекспе без флага u — ключевые слова без границ.
const WEB_HINT_RE =
  /веб|web|фронт|front|\bui\b|\bux\b|страниц|экран|компонент|вёрстк|верстк|интерфейс|дашборд|dashboard|layout|tailwind|heroui|\breact\b|next\.?js|\.tsx|apps\/web/i;
// Признаки чисто бэкенд-задачи (→ браузер не нужен).
const API_HINT_RE =
  /\bapi\b|бэкенд|бекенд|backend|сервер|endpoint|контроллер|controller|роут\b|route handler|миграци|migration|prisma|nest|\bdto\b|guard|\be2e\b|apps\/api/i;

// Нужен ли фазе браузер. Решение по НАЗВАНИЯМ: фаза + все её открытые issue.
// Фронтенд-подсказка перевешивает бэкенд. Порядок:
//   1) явный список config.browserMilestones — форсит браузер;
//   2) есть веб-признак в названии фазы или любой issue → да;
//   3) всё выглядит как бэкенд → нет;
//   4) неоднозначно → нет (без браузера дешевле).
function needsBrowser(id, milestoneTitle, issueTitles = []) {
  if (browserMilestones.map(Number).includes(Number(id))) return true;
  const haystack = [milestoneTitle, ...issueTitles].join(' • ');
  if (WEB_HINT_RE.test(haystack)) return true;
  if (API_HINT_RE.test(haystack)) return false;
  return false;
}

// Резолвит числовой id майлстона в его название через GitHub API.
// Название нужно только для читаемого промпта и заголовка PR; фильтрация
// issue идёт строго по id.
function resolveMilestoneTitle(id) {
  try {
    return runOut(
      `gh api ${JSON.stringify(`repos/{owner}/{repo}/milestones/${id}`)} --jq .title`,
    ).trim();
  } catch {
    console.error(
      `Не удалось получить milestone #${id} через gh api — проверьте id и доступ к репозиторию.`,
    );
    process.exit(1);
  }
}

function branchExists(branch) {
  return runOut(`git branch --list ${JSON.stringify(branch)}`).trim().length > 0;
}

// Номер фазы из названия майлстоуна ("Фаза 3: API — ..." → 3).
function phaseNumber(title) {
  const m = title.match(/фаза\s+(\d+)/i);
  if (!m) {
    console.error(`Не удалось извлечь номер фазы из названия майлстоуна: "${title}"`);
    process.exit(1);
  }
  return Number(m[1]);
}

// Отрезает префикс "Фаза N:" — на перевод уходит только смысловая часть.
function stripPhasePrefix(title) {
  return title.replace(/^\s*фаза\s+\d+\s*[:.\-–—]?\s*/i, '').trim();
}

function normalizeSlug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Переводит русское название майлстоуна в английский kebab-case slug через
// разовый вызов `claude -p` (haiku, 1 turn). Результат кэшируется в
// ralph-branch-names.json, чтобы повторные запуски брали то же имя ветки
// и не плодили дубликаты PR.
function slugFromClaude(descriptivePart) {
  const prompt =
    `Переведи название задачи на английский и верни ТОЛЬКО kebab-case slug ` +
    `(строчные латинские буквы, цифры, дефисы), 2–5 слов, без номера фазы, ` +
    `без слова "phase", без кавычек и пояснений. Название: "${descriptivePart}"`;
  let out;
  try {
    out = runOut(
      `claude -p ${JSON.stringify(prompt)} --model claude-haiku-4-5-20251001 --max-turns 1 ${SKIP_FLAG}`,
    );
  } catch (err) {
    console.error(`Не удалось получить перевод названия через claude -p:\n${err.message}`);
    process.exit(1);
  }
  const slug = normalizeSlug(out.trim().split('\n').filter(Boolean).pop() ?? '');
  if (!slug) {
    console.error(`claude -p вернул пустой/непригодный slug для: "${descriptivePart}"`);
    process.exit(1);
  }
  return slug;
}

function cacheBranchName(id, slug) {
  branchNameCache[String(id)] = slug;
  fs.writeFileSync(branchCachePath, `${JSON.stringify(branchNameCache, null, 2)}\n`);
}

// Имя ветки майлстоуна: feature/<англ-slug>-phase-<номер фазы>.
// slug ищется по порядку: ручной оверрайд config.branchNames → кэш переводов →
// разовый перевод через claude -p (с записью в кэш).
function resolveBranch(id, title) {
  const phase = phaseNumber(title);
  const manual = (config.branchNames ?? {})[String(id)];
  const cached = branchNameCache[String(id)];
  let slug = manual ?? cached;
  if (!slug) {
    slug = slugFromClaude(stripPhasePrefix(title));
    cacheBranchName(id, slug);
    console.log(`🌿 Milestone #${id}: slug "${slug}" (кэш ${path.basename(branchCachePath)})`);
  }
  return `${branchPrefix}${slug}-phase-${phase}`;
}

function ensureBranch(branch) {
  // Незакоммиченные правки в отслеживаемых файлах ломают переключение веток.
  // Останавливаемся с внятным сообщением вместо сырого стек-трейса git.
  const dirty = runOut('git status --porcelain').trim();
  if (dirty) {
    console.error(
      `Рабочее дерево не чистое — не могу переключиться на ветку ${branch}:\n${dirty}\n` +
        `Закоммитьте или откатите изменения и запустите скрипт снова.`,
    );
    process.exit(1);
  }
  if (branchExists(branch)) {
    run(`git checkout ${JSON.stringify(branch)}`);
  } else {
    run(`git checkout ${JSON.stringify(baseBranch)}`);
    run(`git checkout -b ${JSON.stringify(branch)}`);
  }
}

// origin/<baseBranch> должен быть не позади локального: PR майлстоунов
// создаются против origin/<baseBranch>, и если он отстаёт — в диф каждого PR
// попадут посторонние коммиты (или базы вообще не будет нужного кода).
function assertBaseBranchPushed() {
  let hasRemote = true;
  try {
    runOut(`git rev-parse --verify --quiet ${JSON.stringify(`origin/${baseBranch}`)}`);
  } catch {
    hasRemote = false;
  }
  if (!hasRemote) return;
  const ahead = runOut(
    `git rev-list --count ${JSON.stringify(`origin/${baseBranch}..${baseBranch}`)}`,
  ).trim();
  if (ahead !== '0') {
    console.error(
      `Локальная ${baseBranch} опережает origin/${baseBranch} на ${ahead} коммит(ов). ` +
        `PR майлстоунов создаются против origin/${baseBranch} и покажут лишний диф.\n` +
        `Сначала выполните: git push origin ${baseBranch}`,
    );
    process.exit(1);
  }
}

// Открытые issue майлстона, по возрастанию номера. `--state open` гарантирует,
// что уже закрытые задачи в работу не попадут (их не берём и не переоткрываем).
function fetchOpenIssues(id) {
  return JSON.parse(
    runOut(`gh issue list --milestone ${id} --state open --json number,title`),
  ).sort((a, b) => a.number - b.number);
}

// Всего issue в майлстоне (открытых + закрытых) — чтобы отличить
// "всё уже сделано" от "в майлстоне вообще нет задач".
function countAllIssues(id) {
  return JSON.parse(runOut(`gh issue list --milestone ${id} --state all --json number`)).length;
}

// Возвращает url уже открытого PR для ветки, либо null.
function openPrUrl(branch) {
  const out = runOut(`gh pr list --head ${JSON.stringify(branch)} --state open --json url`).trim();
  const parsed = JSON.parse(out || '[]');
  return parsed.length > 0 ? parsed[0].url : null;
}

function processMilestone(id) {
  const title = resolveMilestoneTitle(id);
  const branch = resolveBranch(id, title);
  const hadBranch = branchExists(branch);

  // Защита: если открытых задач в майлстоне нет и ветку под него мы ещё не
  // заводили (т.е. в этом прогоне по нему не работали) — майлстоун уже закрыт
  // целиком или пуст. Пропускаем полностью: ни ветки, ни PR, ни review.
  // Если ветка уже была — значит по майлстоуну шла работа в прошлом прогоне,
  // и её надо довести до PR (ниже, в основном цикле).
  if (!hadBranch && fetchOpenIssues(id).length === 0) {
    const total = countAllIssues(id);
    console.log(
      total === 0
        ? `⏭  Milestone #${id}: ${title} — в майлстоне нет задач. Пропускаем.`
        : `⏭  Milestone #${id}: ${title} — все ${total} задач(и) уже закрыты. Пропускаем.`,
    );
    return;
  }

  // Решение про браузер — по названию фазы И названиям всех её открытых issue.
  // Фиксируем один раз на фазу (сессия claude общая через --resume, менять
  // набор MCP-серверов посреди неё нельзя).
  const browser = needsBrowser(
    id,
    title,
    fetchOpenIssues(id).map((i) => i.title),
  );
  const turnBudget = maxTurnsOverrides[String(id)] ?? (browser ? browserMaxTurns : maxTurns);
  // Единый UUID сессии на всю фазу (при resumeWithinMilestone): 1-я issue
  // создаёт (--session-id), следующие продолжают (--resume) — контекст не
  // остывает между issue.
  const sessionId = crypto.randomUUID();
  let sessionExists = false; // сессия claude уже создана — переживает ретраи и итерации
  const milestoneUsage = newUsageAcc();
  const continuations = {}; // issueNumber -> сколько раз подряд продолжали (после исчерпания ходов)

  console.log(
    `\n════════ Milestone #${id}: ${title}  →  ветка ${branch} ════════\n` +
      `        браузер: ${browser ? 'да (Playwright MCP)' : 'нет (--strict-mcp-config)'} · ` +
      `бюджет ходов: ${turnBudget} · resume в фазе: ${resumeWithinMilestone ? 'да' : 'нет'} · ` +
      `гейт: ${verify ? verifyCmd : 'выключен'}`,
  );
  ensureBranch(branch);

  let iterationsUsed = 0;

  // while(true), а не for(i<=maxIterations): проверка "issues кончились - пора
  // делать PR" не должна зависеть от того, остался ли ещё бюджет итераций.
  // Иначе если число открытых issue ровно совпадёт с maxIterations, цикл
  // выйдет по лимиту сразу после закрытия последней issue и ни разу не
  // проверит, что milestone уже завершён - PR не создастся.
  while (true) {
    const issues = fetchOpenIssues(id);

    if (issues.length === 0) {
      pushBranchSafe(branch);
      let prUrl = openPrUrl(branch);
      if (prUrl) {
        console.log(
          `✅ Milestone #${id} завершён за ${iterationsUsed} итераций. PR уже открыт: ${prUrl}`,
        );
      } else {
        console.log(`✅ Milestone #${id} завершён за ${iterationsUsed} итераций. Создаём PR.`);
        try {
          prUrl = runOut(
            `gh pr create --title ${JSON.stringify(`feat: ${title}`)} --body ${JSON.stringify(`Closes all issues in milestone #${id}: ${title}`)} --base ${JSON.stringify(baseBranch)} --head ${JSON.stringify(branch)}`,
          ).trim();
        } catch (err) {
          safeStop(
            `Milestone #${id}: не удалось создать PR:\n${err.message}\n` +
              `Ветка запушена. Создайте PR вручную (gh pr create --base ${baseBranch} --head ${branch}) ` +
              `и перезапустите скрипт — ralph подхватит открытый PR и запустит ревью.`,
          );
        }
      }
      // Финальное ревью всей фазы — намеренно на opus и в свежей сессии
      // (не продолжаем контекст реализации). Браузер — по типу фазы.
      const rev = runClaudeStreamed(
        `Сделай детальное code review PR ${prUrl}. Проверь архитектуру, безопасность, производительность и соответствие PRD. Оставь комментарии прямо в PR через gh cli.`,
        { model: 'claude-opus-5', noBrowser: !browser },
      );
      addUsage(milestoneUsage, rev.info);
      addUsage(grandTotal, rev.info);
      if (!rev.ok) {
        console.error(
          `⚠️  Финальное ревью Milestone #${id} не завершилось штатно — PR ${prUrl} создан, ` +
            `прогоните ревью вручную.`,
        );
      }
      console.log(`\n💰 Milestone #${id} итого: ${fmtUsage(milestoneUsage)}`);
      return;
    }

    if (iterationsUsed >= maxIterations) {
      console.log(
        `⏸ Milestone #${id}: достигнут лимит итераций (${maxIterations}), открытых issue ещё ${issues.length}. ` +
          `Запустите скрипт снова с этим id, чтобы продолжить.`,
      );
      process.exit(0);
    }

    const next = issues[0];
    const prompt = config.prompt
      .replaceAll('{issue}', String(next.number))
      .replaceAll('{milestone}', title)
      .replaceAll('{milestoneId}', String(id))
      .replaceAll('{branch}', branch);

    iterationsUsed++;
    const contN = continuations[next.number] || 0;
    console.log(
      `🔄 Milestone #${id} · итерация ${iterationsUsed}/${maxIterations}` +
        (contN ? ` (продолжение #${next.number} ${contN}/${maxContinuationsPerIssue})` : '') +
        `. Открытых issue: ${issues.length}. Следующий: #${next.number} ${next.title}`,
    );

    // Сессия: при resumeWithinMilestone — общая на фазу; иначе своя на каждую issue.
    const sid = resumeWithinMilestone ? sessionId : crypto.randomUUID();
    let sidExists = resumeWithinMilestone ? sessionExists : false;

    // Прогон claude с ретраями транзиентных сбоев (таймаут / краш / транзиент
    // API). Исчерпание --max-turns и claude-репорт об ошибке НЕ ретраятся.
    let hitTurnLimit = false;
    for (let attempt = 1; ; attempt++) {
      const outcome = runClaudeStreamed(prompt, {
        turns: turnBudget,
        sessionId: sid,
        resume: sidExists,
        noBrowser: !browser,
      });
      addUsage(milestoneUsage, outcome.info);
      addUsage(grandTotal, outcome.info);
      if (outcome.sessionExists) {
        sidExists = true;
        if (resumeWithinMilestone) sessionExists = true;
      }

      if (outcome.ok) break;

      const info = outcome.info;
      if (
        info &&
        !info.is_error &&
        typeof info.num_turns === 'number' &&
        info.num_turns >= turnBudget
      ) {
        // Кончился бюджет ходов: прогресс, как правило, уже закоммичен. Не
        // ретраим и не останавливаемся — ниже отработают гейт и продолжение issue.
        hitTurnLimit = true;
        console.log(
          `ℹ️  Issue #${next.number}: исчерпан бюджет ходов (${info.num_turns}/${turnBudget}). Проверяю гейтом.`,
        );
        break;
      }
      if (info && info.is_error) {
        safeStop(
          `Milestone #${id}, итерация ${iterationsUsed} (issue #${next.number}): claude завершился ошибкой. ` +
            `Не продвигаюсь.\n💰 Milestone #${id} до сбоя: ${fmtUsage(milestoneUsage)}`,
        );
      }
      // Сайдбенд не записан → claude не доработал: таймаут / краш / транзиент API.
      if (attempt > maxRetries) {
        safeStop(
          `Milestone #${id}, итерация ${iterationsUsed} (issue #${next.number}): claude не завершился ` +
            `после ${attempt} попыток${outcome.timedOut ? ' (таймаут)' : ''}.\n` +
            `${outcome.err ? outcome.err.message : ''}\n💰 Milestone #${id} до сбоя: ${fmtUsage(milestoneUsage)}`,
        );
      }
      console.error(
        `⚠️  claude не завершился${outcome.timedOut ? ' (таймаут)' : ''}, попытка ${attempt}/${maxRetries + 1}. ` +
          `Повтор через ${retryDelaySec}s…`,
      );
      sleepSec(retryDelaySec);
    }

    // Прогресс — в origin (с ретраями). Краш на следующей issue не потеряет
    // сделанное, и ход работы виден в origin.
    pushBranchSafe(branch);

    // Гейт: незакоммиченного быть не должно + lint/typecheck/test зелёные.
    const dirty = hasUncommittedTrackedChanges();
    const green = verifyGate();
    const stillOpen = fetchOpenIssues(id).some((i) => i.number === next.number);

    if (dirty || !green) {
      const reason = dirty
        ? 'агент оставил незакоммиченные правки в отслеживаемых файлах'
        : `гейт качества красный (${verifyCmd})`;
      if (!stillOpen) {
        try {
          run(`gh issue reopen ${next.number}`);
          run(
            `gh issue comment ${next.number} --body ${JSON.stringify(
              `ralph-loop: после итерации ${iterationsUsed} — ${reason}. ` +
                `Issue переоткрыт, автопрогон остановлен, нужна ручная проверка.`,
            )}`,
          );
          console.error(`↩️  Issue #${next.number} переоткрыт.`);
        } catch (e) {
          console.error(
            `⚠️  не смог переоткрыть/прокомментировать issue #${next.number}: ${e.message}`,
          );
        }
      }
      safeStop(
        `Milestone #${id}, issue #${next.number}: ${reason}. Дальше не иду.\n` +
          `💰 Milestone #${id}: ${fmtUsage(milestoneUsage)}`,
      );
    }

    // Гейт зелёный.
    if (stillOpen) {
      continuations[next.number] = (continuations[next.number] || 0) + 1;
      if (continuations[next.number] > maxContinuationsPerIssue) {
        safeStop(
          `Milestone #${id}, issue #${next.number}: гейт зелёный, но issue не закрыт за ` +
            `${maxContinuationsPerIssue} продолжений подряд. Останавливаюсь — посмотрите, ` +
            `что мешает агенту его закрыть.\n💰 Milestone #${id}: ${fmtUsage(milestoneUsage)}`,
        );
      }
      console.log(
        `↻ Issue #${next.number} ещё открыт${hitTurnLimit ? ' (кончились ходы)' : ''}, гейт зелёный — ` +
          `продолжу в следующей итерации (${continuations[next.number]}/${maxContinuationsPerIssue}).`,
      );
    } else {
      delete continuations[next.number];
      console.log(`✅ Issue #${next.number} закрыт, гейт зелёный.`);
    }
  }
}

assertBaseBranchPushed();

console.log(`Milestone к обработке (по порядку): ${milestoneIds.join(', ')}`);
for (const id of milestoneIds) {
  processMilestone(id);
}
console.log(
  `\n🏁 Все milestone (${milestoneIds.join(', ')}) обработаны.\n` +
    `💰 Всего за прогон: ${fmtUsage(grandTotal)}`,
);

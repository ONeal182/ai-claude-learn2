#!/usr/bin/env node
// Внешний оркестратор Ralph loop.
//
// Запускать НАПРЯМУЮ пользователем (не как Claude Code hook):
//   node .claude/ralph-loop.js
//   nohup node .claude/ralph-loop.js > ralph.log 2>&1 &   # в фоне
//
// Claude Code hooks (Stop и т.п.) ограничены по времени выполнения (по
// умолчанию порядка минуты) и не предназначены для синхронного ожидания
// целого вложенного `claude -p` прогона в десятки минут — попытка сделать
// это внутри Stop hook приводит к его убийству харнесом и неконтролируемой
// рекурсии дочерних сессий (settings.json действует и на вложенные claude -p,
// так что их завершение снова триггерит Stop hook). Поэтому цикл живёт здесь,
// как обычный процесс вне системы хуков.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'ralph.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { milestone, branch, maxIterations, maxTurns } = config;

if (!milestone) {
  console.error('ralph.config.json: не задан milestone');
  process.exit(1);
}
if (!branch) {
  console.error('ralph.config.json: не задан branch');
  process.exit(1);
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function runOut(cmd) {
  return execSync(cmd, { encoding: 'utf8' });
}

const formatterPath = path.join(__dirname, 'ralph-format.js');

// Гоняет `claude -p` с построчным стримом (--output-format stream-json --verbose)
// через ralph-format.js, чтобы в ralph.log было видно ход работы по шагам,
// а не только финальный ответ по завершении итерации. `set -o pipefail` в
// bash нужен, чтобы код выхода claude (а не форматтера) долетал до нас.
function runClaudeStreamed(prompt, extraArgs) {
  const cmd = `set -o pipefail; claude -p ${JSON.stringify(prompt)} --output-format stream-json --verbose ${extraArgs} | node ${JSON.stringify(formatterPath)}`;
  execSync(cmd, { stdio: 'inherit', shell: '/bin/bash' });
}

const branchExists = runOut(`git branch --list ${JSON.stringify(branch)}`).trim().length > 0;
run(branchExists ? `git checkout ${branch}` : `git checkout -b ${branch}`);

const SKIP_FLAG = '--dangerously-skip-permissions';

let iterationsUsed = 0;

// while(true), а не for(i<=maxIterations): проверка "issues кончились - пора
// делать PR" не должна зависеть от того, остался ли ещё бюджет итераций.
// Иначе если число открытых issue ровно совпадёт с maxIterations, цикл
// выйдет по лимиту сразу после закрытия последней issue и ни разу не
// проверит, что milestone уже завершён - PR не создастся.
while (true) {
  const issues = JSON.parse(
    runOut(
      `gh issue list --milestone ${JSON.stringify(milestone)} --state open --json number,title`,
    ),
  ).sort((a, b) => a.number - b.number);

  if (issues.length === 0) {
    console.log(`✅ Milestone завершён после ${iterationsUsed} итераций. Создаём PR.`);
    const prUrl = runOut(
      `gh pr create --title ${JSON.stringify(`feat: ${milestone}`)} --body ${JSON.stringify(`Closes all issues in milestone: ${milestone}`)} --base main --head ${branch}`,
    ).trim();
    runClaudeStreamed(
      `Сделай детальное code review PR ${prUrl}. Проверь архитектуру, безопасность, производительность и соответствие PRD. Оставь комментарии прямо в PR через gh cli.`,
      `--model claude-opus-5 ${SKIP_FLAG}`,
    );
    process.exit(0);
  }

  if (iterationsUsed >= maxIterations) {
    console.log(
      `⏸ Достигнут лимит итераций (${maxIterations}), открытых issue ещё ${issues.length}. Запустите скрипт снова, чтобы продолжить.`,
    );
    process.exit(0);
  }

  const next = issues[0];
  const prompt = config.prompt
    .replace('{issue}', next.number)
    .replace('{milestone}', milestone)
    .replace('{branch}', branch);

  iterationsUsed++;
  console.log(
    `🔄 Итерация ${iterationsUsed}/${maxIterations}. Открытых issue: ${issues.length}. Следующий: #${next.number} ${next.title}`,
  );
  try {
    runClaudeStreamed(prompt, `--max-turns ${maxTurns} ${SKIP_FLAG}`);
  } catch (err) {
    console.error(
      `\n🛑 Итерация ${iterationsUsed} (issue #${next.number}) упала с ошибкой, останавливаюсь без перехода к следующей:\n${err.message}`,
    );
    process.exit(1);
  }
}

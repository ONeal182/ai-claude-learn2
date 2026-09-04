const { execSync } = require('child_process');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('.claude/ralph.config.json', 'utf8'));

const counterFile = '.claude/ralph.iterations.json';
let counter = { count: 0 };

if (fs.existsSync(counterFile)) {
  counter = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
}

if (counter.count >= config.maxIterations) {
  console.log(`Достигнут лимит итераций (${config.maxIterations}) Ralph останавливается.`);
  fs.writeFileSync(counterFile, JSON.stringify({ count: 0 }));
  process.exit(0);
}

const output = execSync(
  `gh issue list --milestone "${config.milestone}" --state open --json number,title`,
).toString();
const issues = JSON.parse(output);

if (issues.length > 0) {
  counter.count++;
  fs.writeFileSync(counterFile, JSON.stringify(counter));

  const next = issues[0];
  console.log(`🔄 Следующий Issue #${next.number}: ${next.title}`);

  const prompt = config.prompt
    .replace('{milestone}', config.milestone)
    .replace('{branch}', config.branch);
  execSync(`claude -p "${prompt}" --max-turns ${config.maxTurns}`, { stdio: 'inherit' });
} else {
  console.log(`✅ Milestone завершён. Создаём PR.`);
  const prUrl = execSync(
    `gh pr create --title "feat: ${config.milestone}" --body "Closes all issues in milestone: ${config.milestone}" --base main --head ${config.branch}`,
  )
    .toString()
    .trim();

  execSync(
    `claude -p "Сделай детальное code review PR ${prUrl}. Проверь архитектуру, безопасность, производительность и соответствие PRD. Оставь комментарии прямо в PR через gh cli." --model claude-opus-4-7`,
    { stdio: 'inherit' },
  );
}

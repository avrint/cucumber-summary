const { existsSync, readFileSync, writeFileSync, readdirSync, statSync } = require('fs');
const { basename, join, extname } = require('path');

const iconColors = {
  Success: "#2da44e",
  Fail: "#cf222e",
  Neutral: "#6e7781",
};

const createProgressBar = (passed = 0, failed = 0, skipped = 0, width = 300, height = 12) => {
  const total = passed + failed + skipped || 1; // Prevent division by zero
  const p = (passed / total) * width;
  const f = (failed / total) * width;
  const s = (skipped / total) * width;

  // Generate SVG with colored sections (Green for passed, Red for failed, Gray for skipped)
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${p}" height="${height}" fill="#10B981"/><rect x="${p}" width="${f}" height="${height}" fill="#EF4444"/><rect x="${p+f}" width="${s}" height="${height}" fill="#9CA3AF"/></svg>`;

  // Handle Base64 encoding for both Node.js (Buffer) and Browser (btoa) environments
  const base64 = typeof Buffer !== 'undefined' ? Buffer.from(svg).toString('base64') : btoa(svg);

  return `<img src="data:image/svg+xml;base64,${base64}" alt="Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}" style="border-radius: 4px;" />`;
};

const dashboardUrl = "https://svg.test-summary.com/dashboard.svg";
const iconImage = (currentColor =  iconColors.Neutral) => currentColor == iconColors.Neutral ? `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#6e7781" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0m3.28 5.78a.75.75 0 0 0-1.06-1.06l-5.5 5.5a.75.75 0 1 0 1.06 1.06z"/></svg>`: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="${currentColor}" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m3.78-9.72a.75.75 0 0 0-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0z" class="icon"/></svg>`;
// const failIconUrl = "https://svg.test-summary.com/icon/fail.svg?s=12";
// const skipIconUrl = "https://svg.test-summary.com/icon/skip.svg?s=12";

// ── helpers ──────────────────────────────────────────────────────────

function findJsonFiles(dir, fileList = []) {
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    if (statSync(filePath).isDirectory()) {
      findJsonFiles(filePath, fileList);
    } else if (extname(filePath) === '.json') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function loadReports(dir) {
  const jsonFiles = findJsonFiles(dir);
  if (jsonFiles.length === 0) {
    console.error(`No JSON files found in directory: ${dir}`);
    process.exit(1);
  }

  let allFeatures = [];
  for (const file of jsonFiles) {
    try {
      const content = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(content)) {
        allFeatures = allFeatures.concat(content);
      } else {
        allFeatures.push(content);
      }
    } catch (err) {
      console.error(`Error reading or parsing ${file}: ${err.message}`);
    }
  }
  return allFeatures;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeMd(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function statusIcon(status) {
  switch ((status || '').toLowerCase()) {
    case 'passed': return iconImage(iconColors.Success);
    case 'failed': return iconImage(iconColors.Fail);
    case 'skipped':
    case 'pending': return iconImage(iconColors.Neutral);;
    case 'undefined':
    case 'ambiguous': return '⚠️';
    default: return '❓';
  }
}

function msToHuman(ms, options = {}) {
  if (ms == null || isNaN(ms) || ms === 0) return '';

  const {
    maxUnits = 7,
    compact = true,
    includeMs = true,
    hideZeros = false
  } = options;

  const isNegative = ms < 0;
  let absMs = Math.abs(ms);

  const UNITS = [
    { label: compact ? 'y' : ' year',   ms: 31536000000 },
    { label: compact ? 'mo' : ' month', ms: 2629800000 },
    { label: compact ? 'd' : ' day',    ms: 86400000 },
    { label: compact ? 'h' : ' hour',   ms: 3600000 },
    { label: compact ? 'm' : ' min',    ms: 60000 },
    { label: compact ? 's' : ' sec',    ms: 1000 },
    { label: compact ? 'ms' : ' ms',    ms: 1 }
  ];

  const parts = [];

  for (const { label, ms: unitMs } of UNITS) {
    if (label.includes('ms') && !includeMs) continue;
    const value = Math.floor(absMs / unitMs);

    if (value > 0 || (parts.length > 0 && !hideZeros)) {
      absMs %= unitMs;
      let displayLabel = label;
      if (!compact && value !== 1) displayLabel += 's';
      parts.push(`${value}${displayLabel}`);
    }
    if (parts.length === maxUnits) break;
  }

  if (parts.length === 0) return '';
  const result = parts.join(' ');
  return isNegative ? `-${result}` : result;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stepDurationMs(d) {
  return d / 1e6;
}

function getScenarioStatus(scenario) {
  const steps = scenario.steps || [];
  if (!steps.length) return 'unknown';
  if (steps.some(s => s.result?.status === 'failed')) return 'failed';
  if (steps.some(s => s.result?.status === 'ambiguous')) return 'ambiguous';
  if (steps.some(s => s.result?.status === 'undefined')) return 'undefined';
  if (steps.some(s => s.result?.status === 'pending')) return 'pending';
  if (steps.every(s => s.result?.status === 'skipped')) return 'skipped';
  if (steps.every(s => ['passed', 'skipped'].includes(s.result?.status))) return 'passed';
  return 'unknown';
}

function scenarioDurationMs(scenario) {
  return (scenario.steps || []).reduce((sum, s) => sum + stepDurationMs(s.result?.duration), 0);
}

// ── collect ──────────────────────────────────────────────────────────

function collect(features) {
  const stats = {
    passed: 0, failed: 0, skipped: 0, pending: 0,
    undefined: 0, ambiguous: 0, total: 0, duration: 0,
  };

  const tree = [];

  for (const feature of features) {
    const scenarios = [];
    for (const el of feature.elements || []) {
      if (el.type === 'background') continue;

      const status = getScenarioStatus(el);
      const duration = scenarioDurationMs(el);

      stats.total++;
      if (stats[status] !== undefined) stats[status]++;
      else stats.failed++;
      stats.duration += duration;

      scenarios.push({ scenario: el, status, duration });
    }
    if (scenarios.length) {
      tree.push({
        feature: feature.name || basename(feature.uri || 'Feature'),
        uri: feature.uri || '',
        scenarios,
      });
    }
  }

  return { stats, tree };
}

// ── render ───────────────────────────────────────────────────────────

function renderGlobalSummary(stats) {
  const duration = msToHuman(stats.duration);
  const failedCount = stats.failed + stats.ambiguous + stats.undefined;
  const skippedCount = stats.skipped + stats.pending;

  let summaryText = "";
  if (stats.passed > 0) summaryText += `${stats.passed} passed`;
  if (failedCount > 0) summaryText += `${summaryText ? ", " : ""}${failedCount} failed`;
  if (skippedCount > 0) summaryText += `${summaryText ? ", " : ""}${skippedCount} skipped`;

  let md = `### Cucumber Results\n\n`;
  // md += `<img src="${dashboardUrl}?p=${stats.passed}&f=${failedCount}&s=${skippedCount}" alt="${summaryText}">\n`;
  md += `${createProgressBar(stats.passed, stats.failed, stats.skipped)}\n`;

  if (duration) md += `\n⏱ **Duration:** ${duration}\n`;
  md += `\n---\n\n`;

  return md;
}



function renderIndex(tree) {
  let md = `### Features\n\n`;

  for (const { feature, scenarios } of tree) {
    const featureAnchor = slugify(feature);
    const featureFailed = scenarios.some(s => s.status === 'failed');
    const featureIcon = featureFailed ? iconImage(iconColors.Success) : iconImage(iconColors.Success);

    md += `- ${featureIcon} [**${escapeMd(feature)}**](#${featureAnchor})\n`;

    for (const { scenario, status } of scenarios) {
      const name = scenario.name || 'Scenario';
      const anchor = slugify(`${feature}-${name}`);
      const icon = statusIcon(status);
      md += `  - ${icon} [${escapeMd(name)}](#${anchor})\n`;
    }
  }

  md += `\n---\n\n`;
  return md;
}

function renderSteps(scenario) {
  const steps = scenario.steps || [];
  if (!steps.length) return '_No steps_\n';

  let body = '';
  for (const step of steps) {
    const status = step.result?.status || 'unknown';
    const icon = statusIcon(status);
    const keyword = (step.keyword || '').trim();
    const name = step.name || '';
    const dur = msToHuman(stepDurationMs(step.result?.duration));
    const durSuffix = dur ? ` _( ${dur} )_` : '';

    body += `${icon} **${escapeHtml(keyword)}** ${escapeHtml(name)}${durSuffix}<br/>\n`;

    if (status === 'failed' && step.result?.error_message) {
      const err = step.result.error_message.trim().slice(0, 4000);
      body += `\n\`\`\`\n${err}\n\`\`\`\n`;
    }
  }
  return body;
}

function renderFeatures(tree) {
  let md = '';

  for (const { feature, uri, scenarios } of tree) {
    const featureAnchor = slugify(feature);
    md += `<a id="${featureAnchor}"></a>\n`;
    md += `## ${escapeMd(feature)}\n\n`;
    if (uri) md += `📄 \`${uri}\`\n\n`;

    for (const { scenario, status, duration } of scenarios) {
      const name = scenario.name || 'Scenario';
      const anchor = slugify(`${feature}-${name}`);
      const icon = statusIcon(status);
      const dur = msToHuman(duration);

      md += `<a id="${anchor}"></a>\n`;
      md += `### ${icon} ${escapeMd(name)}\n\n`;
      if (dur) md += `⏱ ${dur}\n\n`;

      md += `<details>\n<summary>Steps</summary>\n\n`;
      md += renderSteps(scenario);
      md += `\n</details>\n\n`;
    }
    md += `---\n\n`;
  }
  return md;
}

function buildMarkdown(features) {
  const { stats, tree } = collect(features);
  return renderGlobalSummary(stats) + renderIndex(tree) + renderFeatures(tree);
}

// ── main ─────────────────────────────────────────────────────────────

// In a GitHub action, inputs are converted to UPPERCASE environment variables with an INPUT_ prefix.
const inputDir = process.env.INPUT_REPORT_PATH || process.argv[2] || '.';

try {
  const features = loadReports(inputDir);
  const markdown = buildMarkdown(features);
  
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  
  if (summaryFile) {
    // Append to the GitHub Action summary file
    writeFileSync(summaryFile, markdown, { encoding: 'utf8', flag: 'a' });
  } else {
    // Fallback if testing locally
    process.stdout.write(markdown);
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
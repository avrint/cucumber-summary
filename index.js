const { existsSync, readFileSync, writeFileSync, readdirSync, statSync } = require('fs');
const { basename, join, extname } = require('path');


// ── Markdown Framework ───────────────────────────────────────────────

class MarkdownBuilder {
  constructor() {
    this.blocks = [];
  }

  addHeading (text, level = 1) {
    this.blocks.push(`${'#'.repeat(level)} ${text}\n\n`);
    return this;
  }

  addSeparator () {
    this.blocks.push(`\n---\n\n`);
    return this;
  }

  addDetails (summary, body) {
    this.blocks.push(`<details>\n<summary>${summary}</summary>\n\n${body}\n</details>\n\n`);
    return this;
  }

  addImage (src, alt = '', props = '') {
    this.blocks.push(`<img src="${src}" alt="${alt}" ${props}>\n`);
    return this;
  }

  addListItem (text, indentLevel = 0) {
    const indent = '  '.repeat(indentLevel);
    this.blocks.push(`${indent}- ${text}\n`);
    return this;
  }

  addCodeBlock (code, lang = '') {
    this.blocks.push(`\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`);
    return this;
  }

  addAnchor (id) {
    this.blocks.push(`<a id="${id}"></a>\n`);
    return this;
  }

  addRaw (text) {
    if (text) this.blocks.push(text);
    return this;
  }

  // The getter you requested to retrieve the final compiled string
  get finalMD () {
    return this.blocks.join('');
  }
}

function generateCucumberChart (stats, title = "Execution Summary") {
  const STATUS_MAP = [
    { key: 'passed', label: 'Passed', color: '#2da44e' },
    { key: 'failed', label: 'Failed', color: '#cf222e' },
    { key: 'skipped', label: 'Skipped', color: '#6e7781' },
    { key: 'pending', label: 'Pending', color: '#d97706' },
    { key: 'undefined', label: 'Undefined', color: '#8250df' },
    { key: 'ambiguous', label: 'Ambiguous', color: '#bf4b00' },
  ];

  const activeStatuses = STATUS_MAP.filter(
    item => typeof stats[item.key] === 'number' && stats[item.key] > 0
  );

  if (activeStatuses.length === 0) {
    return `> [!NOTE]\n> No test execution data available.\n\n`;
  }

  const themeVariables = activeStatuses
    .map((status, index) => `    pie${index + 1}: '${status.color}'`)
    .join('\n');

  const slices = activeStatuses
    .map(status => `    "${status.label}" : ${stats[status.key]}`)
    .join('\n');

  return `\`\`\`mermaid\n---\nconfig:\n  theme: base\n  themeVariables:\n${themeVariables}\n    pieOuterStrokeWidth: '2px'\n  pie:\n    textPosition: 0.5\n    donutHole: 0.45\n---\npie showData\n    title ${title}\n${slices}\n\`\`\`\n\n`;
}

const createProgressBar = (passed = 0, failed = 0, skipped = 0, width = 300, height = 12) => {
  const total = passed + failed + skipped || 1; // Prevent division by zero
  const p = (passed / total) * width;
  const f = (failed / total) * width;
  const s = (skipped / total) * width;

  // Generate SVG with colored sections (Green for passed, Red for failed, Gray for skipped)
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${p}" height="${height}" fill="#10B981"/><rect x="${p}" width="${f}" height="${height}" fill="#EF4444"/><rect x="${p + f}" width="${s}" height="${height}" fill="#9CA3AF"/></svg>`;

  // Handle Base64 encoding for both Node.js (Buffer) and Browser (btoa) environments
  const base64 = typeof Buffer !== 'undefined' ? Buffer.from(svg).toString('base64') : btoa(svg);

  return `<img src="data:image/svg+xml;base64,${base64}" alt="Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}" style="border-radius: 4px;" />`;
};

let timestamp = Date.now();

const dashboardUrl = "https://svg.test-summary.com/dashboard.svg";
const failIconUrl = "https://avrint.github.io/cucumber-summary/docs/fail.svg?t=" + timestamp;
const passIconUrl = "https://avrint.github.io/cucumber-summary/docs/pass.svg?t=" + timestamp;
const skipIconUrl = "https://avrint.github.io/cucumber-summary/docs/skip.svg?t=" + timestamp; // Changed pass.svg to skip.svg

const iconColors = {
  Success: passIconUrl,
  Fail: failIconUrl,
  Neutral: skipIconUrl,
};

const iconImage = (currentColor) => `<img src="${currentColor}" />`;
// ── helpers ──────────────────────────────────────────────────────────

function findJsonFiles (dir, fileList = []) {
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

function loadReports (dir) {
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

function escapeHtml (text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeMd (text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function statusIcon (status) {
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

function msToHuman (ms, options = {}) {
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
    { label: compact ? 'y' : ' year', ms: 31536000000 },
    { label: compact ? 'mo' : ' month', ms: 2629800000 },
    { label: compact ? 'd' : ' day', ms: 86400000 },
    { label: compact ? 'h' : ' hour', ms: 3600000 },
    { label: compact ? 'm' : ' min', ms: 60000 },
    { label: compact ? 's' : ' sec', ms: 1000 },
    { label: compact ? 'ms' : ' ms', ms: 1 }
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

function slugify (text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stepDurationMs (d) {
  return d / 1e6;
}

function getScenarioStatus (scenario) {
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

function scenarioDurationMs (scenario) {
  return (scenario.steps || []).reduce((sum, s) => sum + stepDurationMs(s.result?.duration), 0);
}

// ── collect ──────────────────────────────────────────────────────────

function collect (features) {
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

function renderGlobalSummary (stats) {
  const md = new MarkdownBuilder();
  const duration = msToHuman(stats.duration);
  const failedCount = stats.failed + stats.ambiguous + stats.undefined;
  const skippedCount = stats.skipped + stats.pending;

  let summaryText = "";
  if (stats.passed > 0) summaryText += `${stats.passed} passed`;
  if (failedCount > 0) summaryText += `${summaryText ? ", " : ""}${failedCount} failed`;
  if (skippedCount > 0) summaryText += `${summaryText ? ", " : ""}${skippedCount} skipped`;

  md.addRaw('<div align="center" width="400">');
  md.addRaw(generateCucumberChart(stats, 'Cucumber Results'));
  md.addRaw('</div>');
  
  if (duration) {
    md.addRaw(`\n⏱ **Duration:** ${duration}\n`);
  }

  return md.addSeparator().finalMD;
}



function renderIndex (tree) {
  const md = new MarkdownBuilder();
  md.addHeading('Features', 3);

  for (const { feature, scenarios } of tree) {
    const featureAnchor = slugify(feature);
    const featureFailed = scenarios.some(s => s.status === 'failed');
    const featureIcon = featureFailed ? iconImage(iconColors.Fail) : iconImage(iconColors.Success);

    md.addListItem(`${featureIcon} [**${escapeMd(feature)}**](#${featureAnchor})`, 0);

    for (const { scenario, status } of scenarios) {
      const name = scenario.name || 'Scenario';
      const anchor = slugify(`${feature}-${name}`);
      const icon = statusIcon(status);
      md.addListItem(`${icon} [${escapeMd(name)}](#${anchor})`, 1);
    }
  }

  return md.addSeparator().finalMD;
}

function renderSteps (scenario) {
  const md = new MarkdownBuilder();
  const steps = scenario.steps || [];

  if (!steps.length) return '_No steps_\n';

  for (const step of steps) {
    const status = step.result?.status || 'unknown';
    const icon = statusIcon(status);
    const keyword = (step.keyword || '').trim();
    const name = step.name || '';
    const dur = msToHuman(stepDurationMs(step.result?.duration));
    const durSuffix = dur ? ` _( ${dur} )_` : '';

    md.addRaw(`${icon} **${escapeHtml(keyword)}** ${escapeHtml(name)}${durSuffix}<br/>\n`);

    if (status === 'failed' && step.result?.error_message) {
      const err = step.result.error_message.trim().slice(0, 4000);
      md.addCodeBlock(err);
    }
  }
  return md.finalMD;
}
function renderFeatures (tree) {
  const md = new MarkdownBuilder();

  for (const { feature, uri, scenarios } of tree) {
    const featureAnchor = slugify(feature);

    md.addAnchor(featureAnchor)
      .addHeading(escapeMd(feature), 2);

    if (uri) md.addRaw(`📄 \`${uri}\`\n\n`);

    for (const { scenario, status, duration } of scenarios) {
      const name = scenario.name || 'Scenario';
      const anchor = slugify(`${feature}-${name}`);
      const icon = statusIcon(status);
      const dur = msToHuman(duration);

      md.addAnchor(anchor)
        .addHeading(`${icon} ${escapeMd(name)}`, 3);

      if (dur) md.addRaw(`⏱ ${dur}\n\n`);

      // Build steps content first, then inject into details block
      const stepsContent = renderSteps(scenario);
      md.addDetails('Steps', stepsContent);
    }
    md.addSeparator();
  }
  return md.finalMD;
}

function buildMarkdown (features) {
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
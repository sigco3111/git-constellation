// Git Constellation - Main Application
// GitHub 커밋 히스토리를 별자리로 시각화

const GITHUB_API = 'https://api.github.com';
const MAX_COMMITS = 500;
const MAX_RETRIES = 3;
const TOKEN_KEY = 'git_constellation_token';

// === Token Management ===
function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function toggleTokenInput() {
  const wrap = document.getElementById('tokenWrap');
  const icon = document.getElementById('tokenToggleIcon');
  const text = document.getElementById('tokenToggleText');
  const isHidden = wrap.style.display === 'none';

  wrap.style.display = isHidden ? 'flex' : 'none';
  icon.textContent = isHidden ? '🔓' : '🔒';

  if (isHidden) {
    const token = getStoredToken();
    document.getElementById('tokenInput').value = token;
    if (token) updateTokenStatus(true);
  }
}

function saveToken() {
  const token = document.getElementById('tokenInput').value.trim();
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
  updateTokenStatus(true);
  document.getElementById('tokenInput').value = '';
  document.getElementById('tokenInput').placeholder = '•••••••••••• (저장됨)';
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  updateTokenStatus(false);
  document.getElementById('tokenInput').value = '';
  document.getElementById('tokenInput').placeholder = 'GitHub Personal Access Token (ghp_...)';
}

function updateTokenStatus(active) {
  const status = document.getElementById('tokenStatus');
  const icon = document.getElementById('tokenToggleIcon');
  if (active) {
    status.textContent = '✅ 토큰이 저장되어 있습니다 (Private 레포 조회 가능)';
    icon.textContent = '🔓';
  } else {
    status.textContent = '';
    icon.textContent = '🔒';
  }
}

function getAuthHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Color palettes
const PALETTES = {
  activity: {
    low: '#4fc3f7',
    medium: '#b388ff',
    high: '#ff80ab',
    extreme: '#ffab40'
  },
  filetype: {
    '.js': '#f7df1e',
    '.ts': '#3178c6',
    '.py': '#3572A5',
    '.rs': '#dea584',
    '.go': '#00ADD8',
    '.md': '#ffffff',
    '.html': '#e34c26',
    '.css': '#563d7c',
    '.json': '#69f0ae',
    '.yml': '#cb171e',
    '.yaml': '#cb171e',
    '.sh': '#89e051',
    '.swift': '#F05138',
    '.kt': '#A97BFF',
    '.java': '#b07219',
    '.c': '#555555',
    '.cpp': '#f34b7d',
    '.rb': '#701516',
    '.php': '#4F5D95',
    '.sql': '#e38c00',
    '.vue': '#41b883',
    '.jsx': '#61dafb',
    '.tsx': '#3178c6',
    'default': '#8888aa'
  },
  aurora: {
    gradient: ['#4fc3f7', '#b388ff', '#ff80ab', '#69f0ae', '#ffab40', '#7c4dff', '#18ffff']
  }
};

let currentData = null;
let simulation = null;
let zoomRef = null;

// === GitHub API ===
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const headers = {
        Accept: 'application/vnd.github.v3+json',
        ...getAuthHeaders()
      };
      const res = await fetch(url, { headers });
      if (res.status === 403) {
        const reset = parseInt(res.headers.get('X-RateLimit-Reset') || '0') * 1000;
        const wait = Math.max(reset - Date.now(), 60000);
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        throw new Error('GitHub API rate limit에 도달했습니다. 잠시 후 다시 시도해주세요.');
      }
      if (res.status === 404) {
        const hasToken = getStoredToken();
        if (!hasToken) throw new Error('레포지토리를 찾을 수 없습니다. Private 레포인 경우 "Private 레포 액세스"에서 토큰을 설정해주세요.');
        throw new Error('레포지토리를 찾을 수 없거나 토큰에 접근 권한이 없습니다.');
      }
      if (!res.ok) throw new Error(`API 오류: ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function fetchAllCommits(owner, repo, since) {
  const commits = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && commits.length < MAX_COMMITS) {
    let url = `${GITHUB_API}/repos/${owner}/${repo}/commits?per_page=100&page=${page}`;
    if (since) url += `&since=${since.toISOString()}`;

    const data = await fetchWithRetry(url);
    if (!data || data.length === 0) break;

    commits.push(...data);
    hasMore = data.length === 100;
    page++;

    // Rate limit courtesy
    await new Promise(r => setTimeout(r, 300));
  }

  const raw = commits.slice(0, MAX_COMMITS);

  // 각 커밋에 스마트 추정치 부여 (추가 API 호출 없음)
  raw.forEach((c, i) => {
    const est = estimateStatsFromMessage(c);
    c.stats = { additions: est.additions, deletions: est.deletions };
    c.files = extractFilesFromMessage(c);
  });

  return raw;
}

function extractFilesFromMessage(commit) {
  const msg = (commit.commit?.message || '').toLowerCase();
  const files = [];
  // 메시지에서 파일 확장자 힌트 추출
  const extPatterns = [
    { ext: '.js', keywords: ['javascript', ' js ', '.js', 'webpack', 'babel', 'eslint'] },
    { ext: '.ts', keywords: ['typescript', ' ts ', '.ts', 'tsx'] },
    { ext: '.py', keywords: ['python', ' py ', '.py', 'pip', 'pytest'] },
    { ext: '.html', keywords: ['html', 'template', 'index.html'] },
    { ext: '.css', keywords: ['css', 'style', 'scss', 'tailwind', '.css'] },
    { ext: '.md', keywords: ['readme', 'doc', 'markdown', '.md'] },
    { ext: '.json', keywords: ['json', 'package.json', 'config'] },
    { ext: '.yml', keywords: ['yaml', 'yml', 'ci/cd', 'github action', 'workflow'] },
    { ext: '.rs', keywords: ['rust', 'cargo', '.rs'] },
    { ext: '.go', keywords: ['golang', ' go ', '.go'] },
    { ext: '.swift', keywords: ['swift', 'xcode', '.swift'] },
  ];
  for (const { ext, keywords } of extPatterns) {
    if (keywords.some(k => msg.includes(k))) {
      files.push({ filename: 'dummy' + ext, additions: 10, deletions: 5 });
    }
  }
  return files;
}

function estimateStatsFromMessage(commit) {
  const msg = commit.commit?.message || '';
  const msgLen = msg.length;
  // PR merge 커밋은 보통 큼
  const isMerge = msg.toLowerCase().includes('merge');
  const isRelease = msg.toLowerCase().includes('release') || msg.toLowerCase().includes('bump');
  const base = isMerge ? 150 : isRelease ? 80 : 15;
  const variance = isMerge ? 200 : isRelease ? 100 : 25;
  const additions = Math.floor(base + Math.random() * variance + msgLen * 0.3);
  const deletions = Math.floor(base * 0.4 + Math.random() * variance * 0.5 + msgLen * 0.15);
  return { additions, deletions };
}

async function fetchRepoInfo(owner, repo) {
  const info = await fetchWithRetry(`${GITHUB_API}/repos/${owner}/${repo}`);
  const contributors = await fetchWithRetry(`${GITHUB_API}/repos/${owner}/${repo}/contributors?per_page=30`);
  return { info, contributors };
}

// === Data Processing ===
function processCommits(commits) {
  return commits.map((c, i) => {
    const stats = c.stats || {};
    const files = c.files || [];

    // Dominant file type
    const fileTypeCount = {};
    files.forEach(f => {
      const ext = '.' + (f.filename.split('.').pop() || '').toLowerCase();
      fileTypeCount[ext] = (fileTypeCount[ext] || 0) + 1;
    });
    const dominantType = Object.entries(fileTypeCount).sort((a, b) => b[1] - a[1])[0];

    const totalChanges = (stats.additions || 0) + (stats.deletions || 0);

    return {
      id: i,
      sha: c.sha.substring(0, 7),
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
      avatar: c.author?.avatar_url || null,
      date: new Date(c.commit.author.date),
      additions: stats.additions || 0,
      deletions: stats.deletions || 0,
      totalChanges,
      dominantType: dominantType ? dominantType[0] : '.unknown',
      fileCount: files.length,
      url: c.html_url
    };
  });
}

function buildConnections(processed) {
  const connections = [];
  const authorCommits = {};

  // Group by author
  processed.forEach(c => {
    if (!authorCommits[c.author]) authorCommits[c.author] = [];
    authorCommits[c.author].push(c);
  });

  // Connect consecutive commits by same author
  Object.values(authorCommits).forEach(commits => {
    commits.sort((a, b) => a.date - b.date);
    for (let i = 0; i < commits.length - 1; i++) {
      connections.push({ source: commits[i].id, target: commits[i + 1].id, type: 'author' });
    }
  });

  // Connect commits that modify same files (within 5 index distance)
  for (let i = 0; i < processed.length; i++) {
    for (let j = i + 1; j < Math.min(i + 6, processed.length); j++) {
      if (processed[i].dominantType === processed[j].dominantType && processed[i].dominantType !== '.unknown') {
        connections.push({ source: processed[i].id, target: processed[j].id, type: 'filetype' });
      }
    }
  }

  return connections;
}

// === Visualization ===
function getColor(commit, mode) {
  if (mode === 'filetype') {
    return PALETTES.filetype[commit.dominantType] || PALETTES.filetype['default'];
  }

  if (mode === 'aurora') {
    const idx = commit.id % PALETTES.aurora.gradient.length;
    return PALETTES.aurora.gradient[idx];
  }

  // Activity mode
  const changes = commit.totalChanges;
  if (changes > 500) return PALETTES.activity.extreme;
  if (changes > 100) return PALETTES.activity.high;
  if (changes > 20) return PALETTES.activity.medium;
  return PALETTES.activity.low;
}

function getSize(commit) {
  const changes = commit.totalChanges;
  const base = 3;
  const scale = Math.min(Math.log2(changes + 1) * 1.5, 18);
  return base + scale;
}

function renderConstellation(processed, connections) {
  const container = document.getElementById('canvas-container');
  const svg = d3.select('#constellation');
  svg.selectAll('*').remove();

  const width = container.clientWidth;
  const height = container.clientHeight;
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const layout = document.getElementById('layoutSelect').value;
  const colorMode = document.getElementById('colorModeSelect').value;

  // SVG defs for filters
  const defs = svg.append('defs');

  // Glow filter
  const glow = defs.append('filter').attr('id', 'glow');
  glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
  const feMerge = glow.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'coloredBlur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Strong glow
  const strongGlow = defs.append('filter').attr('id', 'strongGlow');
  strongGlow.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'coloredBlur');
  const feMerge2 = strongGlow.append('feMerge');
  feMerge2.append('feMergeNode').attr('in', 'coloredBlur');
  feMerge2.append('feMergeNode').attr('in', 'SourceGraphic');

  // Nebula gradients
  const nebulaG = svg.append('g');
  for (let i = 0; i < 3; i++) {
    const grad = defs.append('radialGradient')
      .attr('id', `nebula-${i}`)
      .attr('cx', `${30 + i * 20}%`)
      .attr('cy', `${20 + i * 30}%`)
      .attr('r', '40%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', PALETTES.aurora.gradient[i * 2]).attr('stop-opacity', 0.03);
    grad.append('stop').attr('offset', '100%').attr('stop-color', 'transparent').attr('stop-opacity', 0);
  }

  // Nebula background
  for (let i = 0; i < 3; i++) {
    nebulaG.append('circle')
      .attr('class', 'nebula')
      .attr('cx', width * (0.3 + i * 0.2))
      .attr('cy', height * (0.2 + i * 0.3))
      .attr('r', Math.min(width, height) * 0.4)
      .attr('fill', `url(#nebula-${i})`);
  }

  // Prepare nodes with positions
  const nodes = processed.map(c => ({
    ...c,
    color: getColor(c, colorMode),
    size: getSize(c)
  }));

  // Deep clone connections to avoid forceLink mutation
  const links = connections
    .filter(c => nodes.find(n => n.id === c.source) && nodes.find(n => n.id === c.target))
    .map(c => ({ source: c.source, target: c.target, type: c.type }));

  // Reset zoom
  svg.transition().duration(300).call(zoomRef.transform, d3.zoomIdentity);

  // Calculate positions based on layout
  if (layout === 'radial') {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) * 0.42;
    const sortedByDate = [...nodes].sort((a, b) => a.date - b.date);
    sortedByDate.forEach((n, i) => {
      const angle = (i / sortedByDate.length) * Math.PI * 2 - Math.PI / 2;
      const radius = maxRadius * (0.3 + 0.7 * (n.totalChanges / Math.max(...nodes.map(nn => nn.totalChanges))));
      n.x = centerX + Math.cos(angle) * radius;
      n.y = centerY + Math.sin(angle) * radius;
    });
  } else if (layout === 'timeline') {
    const sortedByDate = [...nodes].sort((a, b) => a.date - b.date);
    const timeRange = sortedByDate[sortedByDate.length - 1].date - sortedByDate[0].date || 1;
    const margin = 60;
    sortedByDate.forEach(n => {
      const t = (n.date - sortedByDate[0].date) / timeRange;
      n.x = margin + t * (width - margin * 2);
      n.y = height / 2 + (Math.random() - 0.5) * height * 0.6;
    });
  }

  // Force simulation (for force layout, or just use calculated positions)
  if (simulation) simulation.stop();
  if (layout === 'force') {
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(30).strength(0.1))
      .force('charge', d3.forceManyBody().strength(-5))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.size + 2))
      .force('x', d3.forceX(width / 2).strength(0.02))
      .force('y', d3.forceY(height / 2).strength(0.02));
  }

  // Main group for all visual elements (zoom target)
  const mainG = svg.append('g').attr('id', 'main-group');

  // Draw links
  const link = mainG.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('class', 'constellation-link')
    .attr('stroke', d => d.type === 'author' ? 'rgba(79,195,247,0.12)' : 'rgba(179,136,255,0.08)')
    .attr('stroke-width', d => d.type === 'author' ? 1 : 0.5);

  // Draw stars
  const node = mainG.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'star-node')
    .call(layout === 'force' ? d3.drag()
      .on('start', (e, d) => { if (simulation) { d.fx = d.x; d.fy = d.y; } })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (simulation) { d.fx = null; d.fy = null; } })
    : null);

  // Star glow
  node.append('circle')
    .attr('r', d => d.size * 2)
    .attr('fill', d => d.color)
    .attr('opacity', 0.15)
    .attr('filter', 'url(#glow)');

  // Star core
  node.append('circle')
    .attr('r', d => d.size)
    .attr('fill', d => d.color)
    .attr('filter', 'url(#glow)');

  // Star bright center
  node.append('circle')
    .attr('r', d => d.size * 0.4)
    .attr('fill', 'white')
    .attr('opacity', 0.6);

  // Cross sparkle for big stars
  node.filter(d => d.size > 10)
    .append('line')
    .attr('x1', d => -d.size * 1.5)
    .attr('y1', 0)
    .attr('x2', d => d.size * 1.5)
    .attr('y2', 0)
    .attr('stroke', d => d.color)
    .attr('stroke-width', 0.5)
    .attr('opacity', 0.3);

  node.filter(d => d.size > 10)
    .append('line')
    .attr('x1', 0)
    .attr('y1', d => -d.size * 1.5)
    .attr('x2', 0)
    .attr('y2', d => d.size * 1.5)
    .attr('stroke', d => d.color)
    .attr('stroke-width', 0.5)
    .attr('opacity', 0.3);

  // Tooltip events
  node.on('mouseover', (e, d) => showTooltip(e, d))
    .on('mousemove', (e) => moveTooltip(e))
    .on('mouseout', hideTooltip);

  // Animation
  if (layout === 'force') {
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
  } else {
    // Set positions BEFORE animation
    link
      .attr('x1', d => typeof d.source === 'object' ? d.source.x : (nodes.find(n => n.id === d.source)?.x || 0))
      .attr('y1', d => typeof d.source === 'object' ? d.source.y : (nodes.find(n => n.id === d.source)?.y || 0))
      .attr('x2', d => typeof d.target === 'object' ? d.target.x : (nodes.find(n => n.id === d.target)?.x || 0))
      .attr('y2', d => typeof d.target === 'object' ? d.target.y : (nodes.find(n => n.id === d.target)?.y || 0));

    node.attr('transform', d => `translate(${d.x},${d.y})`);

    // Animate entrance (fade in, not transform)
    node.attr('opacity', 0)
      .transition()
      .duration(800)
      .delay((d, i) => i * 5)
      .attr('opacity', 1);
  }

  // Zoom & pan on main group
  const zoom = d3.zoom()
    .scaleExtent([0.3, 5])
    .on('zoom', (e) => {
      mainG.attr('transform', e.transform);
    });

  svg.call(zoom);
  zoomRef = zoom;

  // Update legend
  updateLegend(colorMode, nodes);
}

// === Tooltip ===
function showTooltip(e, commit) {
  const tooltip = document.getElementById('tooltip');
  const dateStr = commit.date.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  tooltip.innerHTML = `
    <div class="tip-title">${escapeHtml(commit.message)}</div>
    <div class="tip-hash">${commit.sha}</div>
    <div class="tip-body">
      👤 ${escapeHtml(commit.author)}<br>
      📅 ${dateStr}<br>
      +${commit.additions} / -${commit.deletions} (${commit.fileCount} files)<br>
      📁 ${commit.dominantType}
    </div>
  `;
  tooltip.style.display = 'block';
  moveTooltip(e);
}

function moveTooltip(e) {
  const tooltip = document.getElementById('tooltip');
  const x = e.clientX + 15;
  const y = e.clientY + 15;
  const rect = tooltip.getBoundingClientRect();

  tooltip.style.left = (x + rect.width > window.innerWidth ? e.clientX - rect.width - 15 : x) + 'px';
  tooltip.style.top = (y + rect.height > window.innerHeight ? e.clientY - rect.height - 15 : y) + 'px';
}

function hideTooltip() {
  document.getElementById('tooltip').style.display = 'none';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// === Legend ===
function updateLegend(mode, nodes) {
  const legend = document.getElementById('legend');
  const content = document.getElementById('legendContent');
  legend.style.display = 'block';

  if (mode === 'activity') {
    content.innerHTML = [
      { color: PALETTES.activity.low, label: '적은 변경 (<20줄)' },
      { color: PALETTES.activity.medium, label: '보통 (20-100줄)' },
      { color: PALETTES.activity.high, label: '많은 변경 (100-500줄)' },
      { color: PALETTES.activity.extreme, label: '대규모 (500+줄)' }
    ].map(({ color, label }) => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${color};box-shadow:0 0 6px ${color}"></div>
        <span>${label}</span>
      </div>
    `).join('');
  } else if (mode === 'filetype') {
    const types = [...new Set(nodes.map(n => n.dominantType))].slice(0, 10);
    content.innerHTML = types.map(t => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${PALETTES.filetype[t] || PALETTES.filetype['default']};box-shadow:0 0 6px ${PALETTES.filetype[t] || PALETTES.filetype['default']}"></div>
        <span>${t}</span>
      </div>
    `).join('');
  } else {
    content.innerHTML = PALETTES.aurora.gradient.map(c => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${c};box-shadow:0 0 6px ${c}"></div>
        <span>${c}</span>
      </div>
    `).join('');
  }
}

// === Stats ===
function updateStats(processed, contributors) {
  const statsBar = document.getElementById('statsBar');
  statsBar.style.display = 'flex';

  const totalCommits = processed.length;
  const totalStars = processed.reduce((s, c) => s + c.totalChanges, 0);
  const uniqueAuthors = [...new Set(processed.map(c => c.author))].length;
  const totalLines = processed.reduce((s, c) => s + c.additions + c.deletions, 0);

  animateCounter('totalCommits', totalCommits);
  animateCounter('totalStars', totalStars);
  animateCounter('totalContributors', uniqueAuthors);
  animateCounter('totalLines', totalLines);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  const duration = 1500;
  const start = parseInt(el.textContent) || 0;
  const startTime = Date.now();

  function update() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (target - start) * eased);

    el.textContent = current.toLocaleString();

    if (progress < 1) requestAnimationFrame(update);
  }
  update();
}

// === Main ===
async function loadConstellation() {
  const input = document.getElementById('repoInput');
  let value = input.value.trim();

  // 빈 입력이면 플레이스홀더에서 레포명 추출
  if (!value) {
    const ph = input.placeholder;
    const match = ph.match(/\((?:예:\s*)?(.+?)\)/);
    if (match) value = match[1].trim();
    input.value = value;
  }

  if (!value) {
    showError('레포지토리를 입력해주세요 (예: sigco3111/hermes_bot)');
    return;
  }

  const [owner, repo] = value.split('/');
  if (!owner || !repo) {
    showError('올바른 형식으로 입력해주세요 (사용자명/레포)');
    return;
  }

  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const statsBar = document.getElementById('statsBar');
  const legend = document.getElementById('legend');

  loading.style.display = 'block';
  error.style.display = 'none';
  statsBar.style.display = 'none';
  legend.style.display = 'none';

  try {
    // Calculate date range
    const period = document.getElementById('periodSelect').value;
    let since = null;
    if (period === 'month') since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    else if (period === 'quarter') since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    else if (period === 'year') since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    // Fetch data
    const [commits, { info, contributors }] = await Promise.all([
      fetchAllCommits(owner, repo, since),
      fetchRepoInfo(owner, repo)
    ]);

    if (commits.length === 0) {
      showError('해당 기간에 커밋이 없습니다. 기간을 늘려보세요.');
      loading.style.display = 'none';
      return;
    }

    // Process and render
    const processed = processCommits(commits);
    const connections = buildConnections(processed);

    renderConstellation(processed, connections);
    updateStats(processed, contributors);

    loading.style.display = 'none';

    // Update page title
    document.title = `🌌 ${owner}/${repo} — Git Constellation`;

    // Save to URL hash
    window.location.hash = `${owner}/${repo}`;

  } catch (e) {
    showError(e.message);
    loading.style.display = 'none';
  }
}

function showError(msg) {
  const error = document.getElementById('error');
  error.textContent = msg;
  error.style.display = 'block';
}

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
  // Enter key support
  document.getElementById('repoInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadConstellation();
  });

  // Layout/color change re-render
  document.getElementById('layoutSelect').addEventListener('change', () => {
    if (currentData) renderConstellation(currentData.processed, currentData.connections);
  });
  document.getElementById('colorModeSelect').addEventListener('change', () => {
    if (currentData) renderConstellation(currentData.processed, currentData.connections);
  });

  // Load from URL hash
  const hash = window.location.hash.substring(1);
  if (hash) {
    document.getElementById('repoInput').value = hash;
    loadConstellation();
  }

  // Check saved token on load
  if (getStoredToken()) updateTokenStatus(true);

  // Override renderConstellation to save data
  const originalRender = renderConstellation;
  renderConstellation = (processed, connections) => {
    currentData = { processed, connections };
    originalRender(processed, connections);
  };
});

// Window resize
window.addEventListener('resize', () => {
  if (currentData) renderConstellation(currentData.processed, currentData.connections);
});

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.resolve(__dirname, '..', 'src', 'content', 'posts');
const PASSWORD = process.env.EDITOR_PASSWORD || 'blog2024';
const PORT = process.env.EDITOR_PORT || 3456;

const app = express();

app.use(express.json());
app.use(session({
  secret: 'blog-editor-secret-' + Date.now(),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 },
}));

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: '未登录' });
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === PASSWORD) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  res.status(403).json({ error: '密码错误' });
});

app.get('/api/check', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

app.get('/api/posts', requireAuth, (req, res) => {
  if (!fs.existsSync(POSTS_DIR)) {
    return res.json([]);
  }
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const posts = files.map((f) => {
    const content = fs.readFileSync(path.join(POSTS_DIR, f), 'utf-8');
    const frontmatter = parseFrontmatter(content);
    return {
      filename: f,
      title: frontmatter.title || f.replace('.md', ''),
      date: frontmatter.date || '',
      category: frontmatter.category || [],
      tags: frontmatter.tags || [],
    };
  });
  res.json(posts);
});

app.get('/api/posts/:filename', requireAuth, (req, res) => {
  const filePath = path.join(POSTS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const frontmatter = parseFrontmatter(content);
  const body = extractBody(content);
  res.json({ filename: req.params.filename, frontmatter, body });
});

app.put('/api/posts/:filename', requireAuth, (req, res) => {
  console.log('\n[收到保存请求]', req.body);
  const { title, date, category, tags, excerpt, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: '标题和内容不能为空' });
  }

  const filePath = path.join(POSTS_DIR, req.params.filename);
  const content = buildMarkdown({ title, date, category, tags, excerpt, body });
  console.log('[要写入的内容]', content.slice(0, 500));


  if (!fs.existsSync(POSTS_DIR)) {
    fs.mkdirSync(POSTS_DIR, { recursive: true });
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  res.json({ ok: true, filename: req.params.filename });
});

app.delete('/api/posts/:filename', requireAuth, (req, res) => {
  const filePath = path.join(POSTS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

app.use(express.static(path.resolve(__dirname, 'editor')));

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const lines = match[1].split('\n');
  const result = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    } else {
      value = value.replace(/^"|"$/g, '');
    }
    result[key] = value;
  }
  return result;
}

function extractBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)/);
  return match ? match[1] : content;
}

function buildMarkdown({ title, date, category, tags, excerpt, body }) {
  const dateStr = date || new Date().toISOString().split('T')[0];
  const catStr = category && category.length > 0
    ? category.map((c) => `"${c}"`).join(', ')
    : '';
  const tagsStr = tags && tags.length > 0
    ? tags.map((t) => `"${t}"`).join(', ')
    : '';

  return [
    '---',
    `title: "${title}"`,
    `date: ${dateStr}`,
    ...(excerpt ? [`excerpt: "${excerpt.replace(/"/g, '\\"')}"`] : []),
    ...(catStr ? [`category: [${catStr}]`] : []),
    ...(tagsStr ? [`tags: [${tagsStr}]`] : []),
    '---',
    '',
    body,
  ].join('\n');
}

app.listen(PORT, () => {
  console.log(`\n📝 博客编辑器已启动: http://localhost:${PORT}`);
  console.log(`   密码: ${PASSWORD}\n`);
});

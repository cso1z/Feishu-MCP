/**
 * 从URL或ID中提取飞书文档ID
 * 支持多种格式:
 * 1. 标准文档URL: https://xxx.feishu.cn/docs/xxx 或 https://xxx.feishu.cn/docx/xxx
 * 2. API URL: https://open.feishu.cn/open-apis/docx/v1/documents/xxx
 * 3. 直接ID: JcKbdlokYoPIe0xDzJ1cduRXnRf
 * 
 * @param input 文档URL或ID
 * @returns 提取的文档ID或null
 */
export function extractDocumentId(input: string): string | null {
  // 移除首尾空白
  input = input.trim();
  
  // 处理各种URL格式
  const docxMatch = input.match(/\/docx\/([a-zA-Z0-9_-]+)/i);
  const docsMatch = input.match(/\/docs\/([a-zA-Z0-9_-]+)/i);
  const apiMatch = input.match(/\/documents\/([a-zA-Z0-9_-]+)/i);
  const directIdMatch = input.match(/^([a-zA-Z0-9_-]{10,})$/); // 假设ID至少10个字符

  // 按优先级返回匹配结果
  const match = docxMatch || docsMatch || apiMatch || directIdMatch;
  return match ? match[1] : null;
}

/**
 * 从URL或Token中提取Wiki节点ID
 * 支持多种格式:
 * 1. Wiki URL: https://xxx.feishu.cn/wiki/xxx
 * 2. 直接Token: xxx
 * 
 * @param input Wiki URL或Token
 * @returns 提取的Wiki Token或null
 */
export function extractWikiToken(input: string): string | null {
  // 移除首尾空白
  input = input.trim();

  // 处理Wiki URL格式
  const wikiMatch = input.match(/\/wiki\/([a-zA-Z0-9_-]+)/i);
  const directMatch = input.match(/^([a-zA-Z0-9_-]{10,})$/); // 假设Token至少10个字符

  // 提取Token，如果存在查询参数，去掉它们
  let token = wikiMatch ? wikiMatch[1] : (directMatch ? directMatch[1] : null);
  if (token && token.includes('?')) {
    token = token.split('?')[0];
  }

  return token;
}

/**
 * 规范化文档ID
 * 提取输入中的文档ID，如果提取失败则返回原输入
 * 
 * @param input 文档URL或ID
 * @returns 规范化的文档ID
 * @throws 如果无法提取有效ID则抛出错误
 */
export function normalizeDocumentId(input: string): string {
  const id = extractDocumentId(input);
  if (!id) {
    throw new Error(`无法从 "${input}" 提取有效的文档ID`);
  }
  return id;
}

/**
 * 规范化Wiki Token
 * 提取输入中的Wiki Token，如果提取失败则返回原输入
 * 
 * @param input Wiki URL或Token
 * @returns 规范化的Wiki Token
 * @throws 如果无法提取有效Token则抛出错误
 */
export function normalizeWikiToken(input: string): string {
  const token = extractWikiToken(input);
  if (!token) {
    throw new Error(`无法从 "${input}" 提取有效的Wiki Token`);
  }
  return token;
}

/**
 * 根据图片二进制数据检测MIME类型
 * @param buffer 图片二进制数据
 * @returns MIME类型字符串
 */
export function detectMimeType(buffer: Buffer): string {
  // 简单的图片格式检测，根据文件头进行判断
  if (buffer.length < 4) {
    return 'application/octet-stream';
  }

  // JPEG格式
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  // PNG格式
  else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  // GIF格式
  else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  // SVG格式 - 检查字符串前缀
  else if (buffer.length > 5 && buffer.toString('ascii', 0, 5).toLowerCase() === '<?xml' || 
           buffer.toString('ascii', 0, 4).toLowerCase() === '<svg') {
    return 'image/svg+xml';
  }
  // WebP格式
  else if (buffer.length > 12 && 
           buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
           buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }
  // 默认二进制流
  else {
    return 'application/octet-stream';
  }
} 

function formatExpire(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '';
  if (seconds < 0) return `<span style='color:#e53935'>已过期</span> (${seconds}s)`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  let str = '';
  if (h) str += h + '小时';
  if (m) str += m + '分';
  if (s || (!h && !m)) str += s + '秒';
  return `${str} (${seconds}s)`;
}

export function renderFeishuAuthResultHtml(data: any): string {
  const isError = data && data.error;
  const now = Math.floor(Date.now() / 1000);
  let expiresIn = data && data.expires_in;
  let refreshExpiresIn = data && (data.refresh_token_expires_in || data.refresh_expires_in);
  if (expiresIn && expiresIn > 1000000000) expiresIn = expiresIn - now;
  if (refreshExpiresIn && refreshExpiresIn > 1000000000) refreshExpiresIn = refreshExpiresIn - now;
  const tokenBlock = data && !isError ? `
    <div class="card">
      <h3>Token 信息</h3>
      <ul class="kv-list">
        <li><b>token_type:</b> <span>${data.token_type || ''}</span></li>
        <li><b>access_token:</b> <span class="foldable" onclick="toggleFold(this)">点击展开/收起</span><pre class="fold scrollable">${data.access_token || ''}</pre></li>
        <li><b>expires_in:</b> <span>${formatExpire(expiresIn)}</span></li>
        <li><b>refresh_token:</b> <span class="foldable" onclick="toggleFold(this)">点击展开/收起</span><pre class="fold scrollable">${data.refresh_token || ''}</pre></li>
        <li><b>refresh_token_expires_in:</b> <span>${formatExpire(refreshExpiresIn)}</span></li>
        <li><b>scope:</b> <pre class="scope">${(data.scope || '').replace(/ /g, '\n')}</pre></li>
      </ul>
      <div class="success-action">
        <span class="success-msg">授权成功，继续完成任务</span>
        <button class="copy-btn" onclick="copySuccessMsg(this)">点击复制到粘贴板</button>
      </div>
    </div>
  ` : '';
  let userBlock = '';
  const userInfo = data && data.userInfo && data.userInfo.data;
  if (userInfo) {
    userBlock = `
      <div class="card user-card">
        <div class="avatar-wrap">
          <img src="${userInfo.avatar_big || userInfo.avatar_thumb || userInfo.avatar_url || ''}" class="avatar" />
        </div>
        <div class="user-info">
          <div class="user-name">${userInfo.name || ''}</div>
          <div class="user-en">${userInfo.en_name || ''}</div>
        </div>
      </div>
    `;
  }
  const errorBlock = isError ? `
    <div class="card error-card">
      <h3>授权失败</h3>
      <div class="error-msg">${escapeHtml(data.error || '')}</div>
      <div class="error-code">错误码: ${data.code || ''}</div>
    </div>
  ` : '';
  return `
    <html>
      <head>
        <title>飞书授权结果</title>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <style>
          body { background: #f7f8fa; font-family: 'Segoe UI', Arial, sans-serif; margin:0; padding:0; }
          .container { max-width: 600px; margin: 40px auto; padding: 16px; }
          .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px #0001; margin-bottom: 24px; padding: 24px 20px; }
          .user-card { display: flex; align-items: center; gap: 24px; }
          .avatar-wrap { flex-shrink: 0; }
          .avatar { width: 96px; height: 96px; border-radius: 50%; box-shadow: 0 2px 8px #0002; display: block; margin: 0 auto; }
          .user-info { flex: 1; }
          .user-name { font-size: 1.5em; font-weight: bold; margin-bottom: 4px; }
          .user-en { color: #888; margin-bottom: 10px; }
          .kv-list { list-style: none; padding: 0; margin: 0; }
          .kv-list li { margin-bottom: 6px; word-break: break-all; }
          .kv-list b { color: #1976d2; }
          .scope { background: #f0f4f8; border-radius: 4px; padding: 6px; font-size: 0.95em; white-space: pre-line; }
          .foldable { color: #1976d2; cursor: pointer; text-decoration: underline; margin-left: 8px; }
          .fold { display: none; background: #f6f6f6; border-radius: 4px; padding: 6px; margin: 4px 0; font-size: 0.92em; max-width: 100%; overflow-x: auto; word-break: break-all; }
          .scrollable { max-width: 100%; overflow-x: auto; font-family: 'Fira Mono', 'Consolas', 'Menlo', monospace; font-size: 0.93em; }
          .success-action { margin-top: 18px; display: flex; align-items: center; gap: 16px; }
          .success-msg { color: #388e3c; font-weight: bold; }
          .copy-btn { background: #1976d2; color: #fff; border: none; border-radius: 4px; padding: 6px 16px; font-size: 1em; cursor: pointer; transition: background 0.2s; }
          .copy-btn:hover { background: #125ea2; }
          .error-card { border-left: 6px solid #e53935; background: #fff0f0; color: #b71c1c; }
          .error-msg { font-size: 1.1em; margin-bottom: 8px; }
          .error-code { color: #b71c1c; font-size: 0.95em; }
          .raw-block { margin-top: 24px; }
          .raw-toggle { color: #1976d2; cursor: pointer; text-decoration: underline; margin-bottom: 8px; display: inline-block; }
          .raw-pre { display: none; background: #23272e; color: #fff; border-radius: 6px; padding: 12px; font-size: 0.95em; overflow-x: auto; max-width: 100%; }
          @media (max-width: 700px) {
            .container { max-width: 98vw; padding: 4vw; }
            .card { padding: 4vw 3vw; }
            .avatar { width: 64px; height: 64px; }
          }
        </style>
        <script>
          function toggleFold(el) {
            var pre = el.nextElementSibling;
            if (pre.style.display === 'block') {
              pre.style.display = 'none';
            } else {
              pre.style.display = 'block';
            }
          }
          function toggleRaw() {
            var pre = document.getElementById('raw-pre');
            if (pre.style.display === 'block') {
              pre.style.display = 'none';
            } else {
              pre.style.display = 'block';
            }
          }
          function copySuccessMsg(btn) {
            var text = '授权成功，继续完成任务';
            navigator.clipboard.writeText(text).then(function() {
              btn.innerText = '已复制';
              btn.disabled = true;
              setTimeout(function() {
                btn.innerText = '点击复制到粘贴板';
                btn.disabled = false;
              }, 2000);
            });
          }
        </script>
      </head>
      <body>
        <div class="container">
          <h2 style="margin-bottom:24px;">飞书授权结果</h2>
          ${errorBlock}
          ${tokenBlock}
          ${userBlock}
          <div class="card raw-block">
            <span class="raw-toggle" onclick="toggleRaw()">点击展开/收起原始数据</span>
            <pre id="raw-pre" class="raw-pre">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
          </div>
        </div>
      </body>
    </html>
  `;
}

function escapeHtml(str: string) {
  return str.replace(/[&<>"]|'/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c;
  });
} 
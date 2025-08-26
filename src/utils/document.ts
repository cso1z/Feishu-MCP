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
      <div class="card success-card">
        <div class="success-text">授权成功</div>
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
           body { 
             background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
             font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; 
             margin: 0; 
             padding: 0; 
             min-height: 100vh;
           }
           .container { 
             max-width: 800px; 
             margin: 60px auto; 
             padding: 20px; 
           }
           .card { 
             background: rgba(255, 255, 255, 0.95); 
             backdrop-filter: blur(10px);
             border-radius: 20px; 
             box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1); 
             margin-bottom: 32px; 
             padding: 32px; 
             border: 1px solid rgba(255, 255, 255, 0.2);
             transition: transform 0.3s ease, box-shadow 0.3s ease;
           }
           .card:hover {
             transform: translateY(-2px);
             box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
           }
           .user-card { 
             display: flex; 
             align-items: center; 
             gap: 32px; 
             padding: 24px 0;
           }
           .avatar-wrap { 
             flex-shrink: 0; 
           }
           .avatar { 
             width: 120px; 
             height: 120px; 
             border-radius: 50%; 
             box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15); 
             display: block; 
             margin: 0 auto; 
             border: 4px solid rgba(255, 255, 255, 0.8);
           }
           .user-info { 
             flex: 1; 
           }
           .user-name { 
             font-size: 2.2em; 
             font-weight: 700; 
             margin-bottom: 8px; 
             color: #2c3e50;
             letter-spacing: -0.5px;
           }
           .user-en { 
             color: #7f8c8d; 
             margin-bottom: 0; 
             font-size: 1.1em;
             font-weight: 500;
           }
           .success-card {
             text-align: center;
             padding: 60px 40px;
             background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
             color: white;
             border: none;
           }
           .success-card:hover {
             transform: none;
             box-shadow: 0 8px 32px rgba(76, 175, 80, 0.3);
           }
           .success-text {
             font-size: 3.5em;
             font-weight: 800;
             margin: 0;
             text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
             letter-spacing: -1px;
           }
           .mcp-title {
             font-size: 1.8em;
             font-weight: 700;
             color: #2c3e50;
             margin-bottom: 16px;
             letter-spacing: -0.5px;
           }
           .mcp-description {
             font-size: 1.1em;
             color: #5a6c7d;
             margin-bottom: 24px;
             line-height: 1.6;
           }
           .mcp-config { 
             margin-top: 24px; 
           }
           .config-code { 
             background: #f8f9fa; 
             border: 2px solid #e9ecef; 
             border-radius: 12px; 
             padding: 20px; 
             font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', monospace; 
             font-size: 0.95em; 
             overflow-x: auto; 
             margin-bottom: 20px; 
             line-height: 1.5;
             color: #495057;
           }
           .copy-btn { 
             background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
             color: #fff; 
             border: none; 
             border-radius: 12px; 
             padding: 12px 24px; 
             font-size: 1em; 
             font-weight: 600;
             cursor: pointer; 
             transition: all 0.3s ease; 
             box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
           }
           .copy-btn:hover { 
             transform: translateY(-2px);
             box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
           }
           .copy-btn:active {
             transform: translateY(0);
           }
           .security-warning {
             margin-top: 24px; 
             padding: 20px; 
             background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); 
             border: 2px solid #fdcb6e; 
             border-radius: 16px; 
             color: #856404;
             position: relative;
             overflow: hidden;
           }
           .security-warning::before {
             content: '';
             position: absolute;
             top: 0;
             left: 0;
             right: 0;
             height: 4px;
             background: linear-gradient(90deg, #fdcb6e, #e17055);
           }
           .security-header {
             display: flex; 
             align-items: center; 
             margin-bottom: 16px;
             font-size: 1.1em;
           }
           .security-icon {
             font-size: 20px; 
             margin-right: 12px;
           }
           .security-title {
             font-weight: 700;
             color: #856404;
           }
           .security-text {
             margin: 0; 
             font-size: 0.95em; 
             line-height: 1.6;
             margin-bottom: 12px;
           }
           .security-text:last-child {
             margin-bottom: 0;
           }
           .security-important {
             color: #d63031;
             font-weight: 600;
           }
           .error-card { 
             border-left: 6px solid #e53935; 
             background: linear-gradient(135deg, #fff0f0 0%, #ffe6e6 100%); 
             color: #b71c1c; 
           }
           .error-msg { 
             font-size: 1.1em; 
             margin-bottom: 8px; 
           }
           .error-code { 
             color: #b71c1c; 
             font-size: 0.95em; 
           }
           .raw-block { 
             margin-top: 32px; 
           }
           .raw-toggle { 
             color: #667eea; 
             cursor: pointer; 
             text-decoration: none;
             margin-bottom: 12px; 
             display: inline-block; 
             font-weight: 600;
             padding: 8px 16px;
             border-radius: 8px;
             transition: background 0.3s ease;
           }
           .raw-toggle:hover {
             background: rgba(102, 126, 234, 0.1);
           }
           .raw-pre { 
             display: none; 
             background: #2c3e50; 
             color: #ecf0f1; 
             border-radius: 12px; 
             padding: 20px; 
             font-size: 0.9em; 
             overflow-x: auto; 
             max-width: 100%; 
             font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', monospace;
             line-height: 1.5;
           }
           .page-title {
             font-size: 2.8em;
             font-weight: 800;
             color: white;
             text-align: center;
             margin-bottom: 40px;
             text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
             letter-spacing: -1px;
           }
           @media (max-width: 768px) {
             .container { 
               max-width: 95vw; 
               margin: 30px auto;
               padding: 16px; 
             }
             .card { 
               padding: 24px 20px; 
               margin-bottom: 24px;
             }
             .avatar { 
               width: 80px; 
               height: 80px; 
             }
             .user-name {
               font-size: 1.8em;
             }
             .success-text {
               font-size: 2.5em;
             }
             .page-title {
               font-size: 2.2em;
               margin-bottom: 30px;
             }
             .user-card {
               gap: 20px;
             }
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
          
          function copyMCPConfig(btn) {
            var openId = '${userInfo ? userInfo.open_id || '' : ''}';
            var config = '"feishu-mcp": {\\n  "url": "https://aicodermate-mcp-feishu-auth.transsion-os.com/sse-trae?open_id=' + openId + '"\\n}';
            navigator.clipboard.writeText(config).then(function() {
              btn.innerText = '已复制';
              btn.disabled = true;
              setTimeout(function() {
                btn.innerText = '复制MCP配置';
                btn.disabled = false;
              }, 2000);
            });
          }
        </script>
      </head>
      <body>
                 <div class="container">
           <h1 class="page-title">飞书授权结果</h1>
           ${errorBlock}
           ${userBlock}
           ${tokenBlock}
                     ${userInfo ? `
           <div class="card">
             <h3 class="mcp-title">MCP配置</h3>
             <p class="mcp-description">首次授权完成后，请将以下配置复制到您的AI IDE中，即可开始使用：</p>
            <div class="mcp-config">
              <pre class="config-code">"feishu-mcp": {
  "url": "https://aicodermate-mcp-feishu-auth.transsion-os.com/sse-trae?open_id=${userInfo.open_id || ''}"
}</pre>
              <button class="copy-btn" onclick="copyMCPConfig(this)">复制MCP配置</button>
            </div>
                         <div class="security-warning">
               <div class="security-header">
                 <span class="security-icon">⚠️</span>
                 <strong class="security-title">安全提示</strong>
               </div>
               <p class="security-text">
                 <strong>说明：</strong>此配置中的 open_id 参数已自动从您的用户信息中读取，无需手动修改。
               </p>
               <p class="security-text">
                 <strong>注意：</strong>只有首次授权完成后，需要把该配置同步更新到IDE中。后续再次授权配置不会变化。
               </p>
               <p class="security-text security-important">
                 <strong>⚠️ 重要：</strong>open_id是你的飞书用户ID，用于标识你的身份，请妥善保管，不要泄露给其他人。
               </p>
             </div>
          </div>
          ` : ''}
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
/**
 * Professional Local MITM Debug Panel
 *
 * 功能：
 * 1. 捕获请求信息
 * 2. 捕获响应信息
 * 3. 记录最近 N 条流量
 * 4. 提供本地 Web 看板
 * 5. 支持 JSON 格式化、Headers 查看、Body 预览、清空日志
 * 6. 支持一键切换明文展示 Cookie / Authorization / Token / Set-Cookie
 *
 * 安全说明：
 * - 敏感凭证字段默认隐藏，例如 Cookie、Authorization、Token、Set-Cookie
 * - 可通过面板按钮或 URL 参数 ?show_creds=1 切换明文展示
 * - 数据仅存储在本地 persistentStore
 *
 * 适用环境：
 * Quantumult X / Surge / Loon 等支持：
 * $request / $response / $persistentStore / $done
 */

const CONFIG = {
  storageKey: "mitm_debug_records_v1",
  panelHostKeyword: "neverssl.com/mybox",
  clearHostKeyword: "neverssl.com/mybox/clear",
  maxRecords: 50,
  maxBodyLength: 5000,
  sensitiveHeaderKeys: [
    "cookie",
    "set-cookie",
    "authorization",
    "proxy-authorization",
    "x-auth-token",
    "x-access-token",
    "access-token",
    "refresh-token",
    "token"
  ],
  capturableContentTypes: [
    "text/",
    "application/json",
    "application/javascript",
    "application/xml",
    "application/xhtml+xml",
    "application/x-www-form-urlencoded"
  ]
};

main();

function main() {
  try {
    if (isClearRequest()) {
      clearRecords();
      return;
    }

    if (isPanelRequest()) {
      renderPanel();
      return;
    }

    if (isResponsePhase()) {
      captureTraffic();
      return;
    }

    $done({});
  } catch (error) {
    handleFatalError(error);
  }
}

function isResponsePhase() {
  return typeof $request !== "undefined" && typeof $response !== "undefined";
}

function isPanelRequest() {
  return (
    typeof $request !== "undefined" &&
    typeof $request.url === "string" &&
    $request.url.includes(CONFIG.panelHostKeyword)
  );
}

function isClearRequest() {
  return (
    typeof $request !== "undefined" &&
    typeof $request.url === "string" &&
    $request.url.includes(CONFIG.clearHostKeyword)
  );
}

/**
 * 捕获流量
 */
function captureTraffic() {
  const requestHeaders = normalizeHeaders($request.headers || {});
  const responseHeaders = normalizeHeaders($response.headers || {});
  const contentType = responseHeaders["content-type"] || "";

  if (!shouldCapture(contentType)) {
    $done({
      body: $response.body
    });
    return;
  }

  const record = buildRecord(requestHeaders, responseHeaders, contentType);
  const records = readRecords();

  records.unshift(record);

  const limitedRecords = records.slice(0, CONFIG.maxRecords);
  writeRecords(limitedRecords);

  $done({
    body: $response.body
  });
}

/**
 * 构建单条记录
 * - headers: 脱敏后的 headers（默认展示）
 * - rawHeaders: 原始明文 headers（切换后展示）
 */
function buildRecord(requestHeaders, responseHeaders, contentType) {
  const urlInfo = parseUrl($request.url || "");

  return {
    id: createId(),
    time: formatTime(),
    timestamp: Date.now(),

    request: {
      method: $request.method || "GET",
      url: $request.url || "",
      scheme: urlInfo.scheme,
      host: urlInfo.host,
      path: urlInfo.path,
      query: urlInfo.query,
      headers: sanitizeHeaders(requestHeaders),
      rawHeaders: requestHeaders
    },

    response: {
      status: $response.status || 200,
      contentType,
      headers: sanitizeHeaders(responseHeaders),
      rawHeaders: responseHeaders,
      body: formatBody($response.body || "", contentType)
    }
  };
}

/**
 * 是否捕获指定类型响应
 */
function shouldCapture(contentType) {
  if (!contentType) return true;

  const lower = contentType.toLowerCase();

  return CONFIG.capturableContentTypes.some(type => {
    return lower.includes(type);
  });
}

/**
 * Header 标准化
 */
function normalizeHeaders(headers) {
  const result = {};

  Object.keys(headers).forEach(key => {
    result[key.toLowerCase()] = String(headers[key]);
  });

  return result;
}

/**
 * 敏感字段保护
 */
function sanitizeHeaders(headers) {
  const result = {};

  Object.keys(headers).forEach(key => {
    const lowerKey = key.toLowerCase();

    if (isSensitiveHeader(lowerKey)) {
      result[key] = "[SENSITIVE VALUE HIDDEN]";
    } else {
      result[key] = headers[key];
    }
  });

  return result;
}

function isSensitiveHeader(key) {
  return CONFIG.sensitiveHeaderKeys.some(sensitiveKey => {
    return key === sensitiveKey || key.includes(sensitiveKey);
  });
}

/**
 * 提取凭证类 headers（用于专用面板展示）
 * 返回 { displayName, value } 数组
 */
function extractCredentials(headers) {
  const result = [];

  Object.keys(headers).forEach(key => {
    const lowerKey = key.toLowerCase();

    if (isSensitiveHeader(lowerKey)) {
      result.push({
        key: key,
        displayName: getCredentialDisplayName(lowerKey),
        value: headers[key]
      });
    }
  });

  return result;
}

function getCredentialDisplayName(lowerKey) {
  const map = {
    "cookie": "Cookie",
    "set-cookie": "Set-Cookie",
    "authorization": "Authorization",
    "proxy-authorization": "Proxy-Authorization",
    "x-auth-token": "X-Auth-Token",
    "x-access-token": "X-Access-Token",
    "access-token": "Access-Token",
    "refresh-token": "Refresh-Token",
    "token": "Token"
  };

  // 精确匹配
  if (map[lowerKey]) return map[lowerKey];

  // 模糊匹配：如 x-csrf-token
  if (lowerKey.includes("token")) return lowerKey.toUpperCase();
  if (lowerKey.includes("cookie")) return lowerKey.toUpperCase();
  if (lowerKey.includes("auth")) return lowerKey.toUpperCase();

  return lowerKey.toUpperCase();
}

/**
 * 格式化响应体
 */
function formatBody(body, contentType) {
  if (typeof body !== "string") {
    return {
      type: "empty",
      raw: "",
      formatted: ""
    };
  }

  const trimmed = body.trim();
  const limited = limitText(trimmed, CONFIG.maxBodyLength);

  if (contentType.toLowerCase().includes("application/json")) {
    try {
      return {
        type: "json",
        raw: limited,
        formatted: JSON.stringify(JSON.parse(trimmed), null, 2)
      };
    } catch (_) {
      return {
        type: "json-invalid",
        raw: limited,
        formatted: limited
      };
    }
  }

  return {
    type: "text",
    raw: limited,
    formatted: limited
  };
}

function limitText(text, maxLength) {
  if (!text) return "";

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n\n... Body 已截断，仅显示前 ${maxLength} 个字符`;
}

/**
 * 面板渲染
 */
function renderPanel() {
  const records = readRecords();
  const showCredentials = readShowCredentialsFlag();
  const html = buildHtml(records, showCredentials);

  $done({
    response: {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
      },
      body: html
    }
  });
}

/**
 * 从请求 URL 中读取 show_creds 参数
 */
function readShowCredentialsFlag() {
  try {
    const url = $request.url || "";
    const match = url.match(/[?&]show_creds=([^&]*)/i);
    return match ? match[1] === "1" : false;
  } catch (_) {
    return false;
  }
}

/**
 * 清空日志
 */
function clearRecords() {
  writeRecords([]);

  $done({
    response: {
      status: 302,
      headers: {
        Location: "/mybox"
      },
      body: ""
    }
  });
}

function buildHtml(records, showCredentials) {
  const cards = records.length
    ? records.map(r => buildRecordCard(r, showCredentials)).join("")
    : buildEmptyState();

  const toggleUrl = showCredentials ? "/mybox" : "/mybox?show_creds=1";
  const toggleText = showCredentials ? "隐藏凭证" : "明文展示凭证";
  const toggleClass = showCredentials ? "danger" : "warn";
  const credsParam = showCredentials ? "1" : "0";

  // 凭证计数
  let totalCreds = 0;
  if (showCredentials) {
    records.forEach(r => {
      totalCreds += extractCredentials(r.request.rawHeaders).length;
      totalCreds += extractCredentials(r.response.rawHeaders).length;
    });
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="120" />
  <title>MITM Debug Panel</title>
  <style>
    :root {
      --bg: #0b1020;
      --panel: #111827;
      --panel-2: #0f172a;
      --border: #1f2937;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --accent: #38bdf8;
      --green: #22c55e;
      --yellow: #eab308;
      --red: #ef4444;
      --orange: #f97316;
      --blue: #3b82f6;
      --code: #020617;
      --cred-bg: #1a0a0a;
      --cred-border: #7f1d1d;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 24px;
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.12), transparent 32%),
        var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      line-height: 1.6;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 22px;
    }

    .title {
      margin: 0;
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -0.03em;
    }

    .subtitle {
      margin-top: 6px;
      color: var(--muted);
      font-size: 14px;
    }

    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .button.primary {
      background: var(--accent);
      color: #020617;
      border-color: var(--accent);
    }

    .button.danger {
      color: #fecaca;
      border-color: rgba(239, 68, 68, 0.35);
      background: rgba(239, 68, 68, 0.08);
    }

    .button.warn {
      color: #fde68a;
      border-color: rgba(234, 179, 8, 0.45);
      background: rgba(234, 179, 8, 0.12);
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .summary-card {
      padding: 16px;
      border-radius: 16px;
      background: rgba(17, 24, 39, 0.86);
      border: 1px solid var(--border);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
    }

    .summary-label {
      color: var(--muted);
      font-size: 12px;
    }

    .summary-value {
      margin-top: 4px;
      font-size: 24px;
      font-weight: 800;
    }

    .record {
      margin-bottom: 16px;
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      background: rgba(17, 24, 39, 0.92);
      box-shadow: 0 14px 32px rgba(0, 0, 0, 0.24);
    }

    .record-header {
      display: grid;
      grid-template-columns: 90px 90px 1fr 170px;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      background: rgba(15, 23, 42, 0.82);
    }

    .method {
      display: inline-flex;
      justify-content: center;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      background: rgba(59, 130, 246, 0.16);
      color: #bfdbfe;
      border: 1px solid rgba(59, 130, 246, 0.35);
    }

    .status {
      display: inline-flex;
      justify-content: center;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      border: 1px solid rgba(34, 197, 94, 0.35);
      color: #bbf7d0;
      background: rgba(34, 197, 94, 0.12);
    }

    .status.warn {
      border-color: rgba(234, 179, 8, 0.35);
      color: #fef3c7;
      background: rgba(234, 179, 8, 0.12);
    }

    .status.error {
      border-color: rgba(239, 68, 68, 0.35);
      color: #fecaca;
      background: rgba(239, 68, 68, 0.12);
    }

    .url {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--accent);
      font-size: 14px;
      font-weight: 600;
    }

    .time {
      color: var(--muted);
      font-size: 12px;
      text-align: right;
    }

    details {
      padding: 0;
    }

    summary {
      cursor: pointer;
      list-style: none;
      padding: 12px 16px;
      color: var(--muted);
      font-size: 13px;
      border-bottom: 1px solid var(--border);
    }

    summary::-webkit-details-marker {
      display: none;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      padding: 16px;
    }

    .section {
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--panel-2);
      overflow: hidden;
    }

    .section-title {
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 800;
      border-bottom: 1px solid var(--border);
      color: var(--text);
      background: rgba(255, 255, 255, 0.03);
    }

    .kv {
      padding: 12px;
      border-bottom: 1px solid var(--border);
    }

    .kv:last-child {
      border-bottom: none;
    }

    .key {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 3px;
    }

    .value {
      word-break: break-all;
      font-size: 13px;
    }

    pre {
      margin: 0;
      padding: 14px;
      max-height: 520px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--code);
      color: #d1d5db;
      font-size: 12px;
      line-height: 1.55;
    }

    /* ===== 凭证明文展示专用样式 ===== */
    .credential-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      margin-bottom: 16px;
      border-radius: 14px;
      border: 2px solid var(--cred-border);
      background: var(--cred-bg);
      color: #fca5a5;
      font-size: 14px;
      font-weight: 700;
    }

    .credential-banner .icon {
      font-size: 22px;
    }

    .credential-section {
      border: 2px solid var(--cred-border);
      border-radius: 14px;
      background: var(--cred-bg);
      overflow: hidden;
      margin-top: 12px;
    }

    .credential-section .section-title {
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
      border-bottom-color: var(--cred-border);
    }

    .credential-item {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(127, 29, 29, 0.4);
    }

    .credential-item:last-child {
      border-bottom: none;
    }

    .credential-key {
      color: #f87171;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .credential-value {
      color: #fecaca;
      font-size: 13px;
      word-break: break-all;
      font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
      line-height: 1.65;
      white-space: pre-wrap;
      background: rgba(0, 0, 0, 0.35);
      padding: 12px;
      border-radius: 8px;
      max-height: 480px;
      overflow: auto;
    }

    .empty {
      padding: 36px;
      text-align: center;
      border: 1px dashed var(--border);
      border-radius: 18px;
      color: var(--muted);
      background: rgba(17, 24, 39, 0.56);
    }

    .notice {
      padding: 12px 14px;
      margin-bottom: 16px;
      border-radius: 14px;
      border: 1px solid rgba(234, 179, 8, 0.35);
      background: rgba(234, 179, 8, 0.08);
      color: #fde68a;
      font-size: 13px;
    }

    .notice.danger {
      border-color: rgba(239, 68, 68, 0.5);
      background: rgba(239, 68, 68, 0.1);
      color: #fca5a5;
    }

    .footer {
      margin-top: 22px;
      text-align: center;
      color: var(--muted);
      font-size: 12px;
    }

    @media (max-width: 820px) {
      body {
        padding: 14px;
      }

      .topbar {
        flex-direction: column;
      }

      .record-header {
        grid-template-columns: 72px 72px 1fr;
      }

      .time {
        grid-column: 1 / -1;
        text-align: left;
      }

      .detail-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="container">
    <section class="topbar">
      <div>
        <h1 class="title">MITM Debug Panel</h1>
        <div class="subtitle">本地流量调试看板 · 最近 ${records.length} 条记录 · 页面每 8 秒刷新</div>
      </div>

      <div class="actions">
        <a class="button primary" href="/mybox${showCredentials ? '?show_creds=1' : ''}">刷新</a>
        <a class="button ${toggleClass}" href="${toggleUrl}">${toggleText}</a>
        <a class="button danger" href="/mybox/clear">清空日志</a>
      </div>
    </section>

    ${showCredentials
      ? `<section class="notice danger">
      <strong>⚠ 凭证明文模式已开启</strong> — Cookie、Authorization、Token、Set-Cookie 等敏感字段正在以完整明文展示。
      请勿在公共场合或截图分享时使用此模式。切换回安全模式请点击上方「隐藏凭证」按钮。
    </section>`
      : `<section class="notice">
      敏感凭证字段默认隐藏，包括 Cookie、Set-Cookie、Authorization、Token 等。
      如需调试凭证，请点击上方「明文展示凭证」按钮切换模式。数据仅存储在本地 persistentStore。
    </section>`
    }

    <section class="summary">
      <div class="summary-card">
        <div class="summary-label">总记录数</div>
        <div class="summary-value">${records.length}</div>
      </div>

      <div class="summary-card">
        <div class="summary-label">最近请求</div>
        <div class="summary-value">${records[0] ? escapeHtml(records[0].request.method) : "-"}</div>
      </div>

      <div class="summary-card">
        <div class="summary-label">最近状态码</div>
        <div class="summary-value">${records[0] ? escapeHtml(records[0].response.status) : "-"}</div>
      </div>

      <div class="summary-card">
        <div class="summary-label">${showCredentials ? '凭证字段数' : '最大保留'}</div>
        <div class="summary-value">${showCredentials ? totalCreds : CONFIG.maxRecords}</div>
      </div>
    </section>

    ${cards}

    <div class="footer">
      Local MITM Debug Panel · Data stored in persistentStore only${showCredentials ? ' · CREDENTIALS VISIBLE' : ''}
    </div>
  </main>
</body>
</html>`;
}

function buildRecordCard(record, showCredentials) {
  const statusClass = getStatusClass(record.response.status);

  // 选择展示的 headers：明文模式用 rawHeaders，否则用脱敏 headers
  const reqHeaders = showCredentials
    ? (record.request.rawHeaders || record.request.headers)
    : record.request.headers;
  const resHeaders = showCredentials
    ? (record.response.rawHeaders || record.response.headers)
    : record.response.headers;

  // 提取凭证专用展示
  const reqCreds = showCredentials ? extractCredentials(record.request.rawHeaders || {}) : [];
  const resCreds = showCredentials ? extractCredentials(record.response.rawHeaders || {}) : [];

  const credentialPanel = (showCredentials && (reqCreds.length > 0 || resCreds.length > 0))
    ? buildCredentialPanel(reqCreds, resCreds)
    : "";

  return `
<section class="record">
  <div class="record-header">
    <div class="method">${escapeHtml(record.request.method)}</div>
    <div class="status ${statusClass}">${escapeHtml(record.response.status)}</div>
    <div class="url">${escapeHtml(record.request.url)}</div>
    <div class="time">${escapeHtml(record.time)}</div>
  </div>

  <details>
    <summary>展开详情：Request / Response / Headers / Body${showCredentials ? ' / 凭证明文' : ''}</summary>

    <div class="detail-grid">
      <section class="section">
        <div class="section-title">Request Info</div>
        ${kv("Scheme", record.request.scheme)}
        ${kv("Host", record.request.host)}
        ${kv("Path", record.request.path)}
        ${kv("Query", record.request.query || "-")}
        ${kv("Method", record.request.method)}
      </section>

      <section class="section">
        <div class="section-title">Response Info</div>
        ${kv("Status", record.response.status)}
        ${kv("Content-Type", record.response.contentType || "-")}
        ${kv("Body Type", record.response.body.type)}
        ${kv("Record ID", record.id)}
        ${kv("Timestamp", record.timestamp)}
      </section>

      <section class="section">
        <div class="section-title">Request Headers${showCredentials ? ' (明文)' : ''}</div>
        <pre>${escapeHtml(formatObject(reqHeaders))}</pre>
      </section>

      <section class="section">
        <div class="section-title">Response Headers${showCredentials ? ' (明文)' : ''}</div>
        <pre>${escapeHtml(formatObject(resHeaders))}</pre>
      </section>

      <section class="section" style="grid-column: 1 / -1;">
        <div class="section-title">Response Body</div>
        <pre>${escapeHtml(record.response.body.formatted || "")}</pre>
      </section>

      ${credentialPanel}
    </div>
  </details>
</section>`;
}

/**
 * 构建凭证专用面板
 */
function buildCredentialPanel(reqCreds, resCreds) {
  let html = "";

  if (reqCreds.length > 0) {
    html += `
      <section class="credential-section" style="grid-column: 1 / -1;">
        <div class="section-title">🔓 Request Credentials（明文）</div>`;

    reqCreds.forEach(cred => {
      html += `
        <div class="credential-item">
          <div class="credential-key">${escapeHtml(cred.displayName)}</div>
          <div class="credential-value">${escapeHtml(cred.value)}</div>
        </div>`;
    });

    html += `</section>`;
  }

  if (resCreds.length > 0) {
    html += `
      <section class="credential-section" style="grid-column: 1 / -1;">
        <div class="section-title">🔓 Response Credentials（明文）</div>`;

    resCreds.forEach(cred => {
      html += `
        <div class="credential-item">
          <div class="credential-key">${escapeHtml(cred.displayName)}</div>
          <div class="credential-value">${escapeHtml(cred.value)}</div>
        </div>`;
    });

    html += `</section>`;
  }

  return html;
}

function buildEmptyState() {
  return `
<section class="empty">
  暂无捕获记录。请先访问一些 HTTP/HTTPS 请求，再刷新本页面。
</section>`;
}

function kv(key, value) {
  return `
<div class="kv">
  <div class="key">${escapeHtml(key)}</div>
  <div class="value">${escapeHtml(value)}</div>
</div>`;
}

function getStatusClass(status) {
  const code = Number(status);

  if (code >= 500) return "error";
  if (code >= 400) return "warn";
  return "";
}

/**
 * 存储相关
 */
function readRecords() {
  try {
    const raw = $persistentStore.read(CONFIG.storageKey);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeRecords(records) {
  try {
    $persistentStore.write(JSON.stringify(records), CONFIG.storageKey);
  } catch (_) {
    // 写入失败时不影响原始请求
  }
}

/**
 * URL 解析
 */
function parseUrl(url) {
  const fallback = {
    scheme: "",
    host: "",
    path: "",
    query: ""
  };

  try {
    const match = String(url).match(/^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i);

    if (!match) {
      return fallback;
    }

    return {
      scheme: match[1] || "",
      host: match[2] || "",
      path: match[3] || "/",
      query: match[4] ? match[4].slice(1) : ""
    };
  } catch (_) {
    return fallback;
  }
}

function formatObject(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value);
  }
}

function createId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function formatTime() {
  const now = new Date();
  const pad = value => String(value).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function handleFatalError(error) {
  const message = error && error.message ? error.message : String(error);

  if (isPanelRequest()) {
    $done({
      response: {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        },
        body: `MITM Panel Error:\n${message}`
      }
    });
    return;
  }

  if (typeof $response !== "undefined") {
    $done({
      body: $response.body
    });
    return;
  }

  $done({});
}

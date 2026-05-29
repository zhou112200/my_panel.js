/**
 * 自动化数据看板 - 跨域抓取与沙盒托管一体化脚本
 * 完美适配：Shadowrocket (小火箭) & gemini.google.com (batchexecute)
 */

const IS_REQUEST = typeof $request !== "undefined" && typeof $response === "undefined";
const IS_RESPONSE = typeof $response !== "undefined";

if (IS_RESPONSE) {
    // ==================== 1. 流量劫持与提取逻辑 ====================
    try {
        let body = $response.body;
        if (body) {
            // 剥离谷歌标志性的防篡改前缀 ")]}'\n"
            if (body.startsWith(")]}'")) {
                body = body.replace(/^\)]\}'\n/, "");
            }
            
            // 将整个外层进行反序列化
            let outerData = JSON.parse(body);
            // 锁定 batchexecute 核心负载：通常在 [0][2] 存储着序列化后的内部大数组
            let innerRaw = outerData[0]?.[2];
            
            if (innerRaw) {
                let innerData = JSON.parse(innerRaw);
                // 深度遍历这个丧心病狂的嵌套多维数组，搜寻真正的模型响应文本
                let chatText = extractGeminiText(innerData);
                
                if (chatText) {
                    let cacheData = {
                        status: "success",
                        source: "Gemini Official",
                        time: new Date().toLocaleString(),
                        content: chatText
                    };
                    // 把洗干净的结构化数据直接写进小火箭沙盒，供稍后前端调取
                    $persistentStore.write(JSON.stringify(cacheData), "gemini_chat_cache");
                }
            }
        }
    } catch (e) {
        // 捕获可能产生的突发性解析异常，并在本地记录错误日志
        $persistentStore.write(JSON.stringify({ status: "error", message: e.message }), "gemini_chat_cache");
    }
    // 必须放行流量，让原始响应继续返回给 Safari，否则官网会卡死
    $done({ body: $response.body });

} else if (IS_REQUEST) {
    // ==================== 2. 前端虚拟控制台渲染逻辑 ====================
    // 从沙盒中取出上一步捕获的数据
    let savedData = $persistentStore.read("gemini_chat_cache");
    let data = savedData ? JSON.parse(savedData) : { status: "empty", message: "暂无捕获数据，请先前往官方网页版 Gemini 发送任意消息触发。" };

    // 拼装用于本地渲染的现代化黑客风 HTML 页面
    let html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>MITM 实时监控控制台</title>
        <style>
            :root { --bg-color: #0b0b0c; --card-bg: #16161a; --border-color: #242429; --accent-color: #34c759; --text-main: #f5f5f7; --text-muted: #86868b; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-color); color: var(--text-main); margin: 0; padding: 24px; display: flex; justify-content: center; }
            .card { background: var(--card-bg); border-radius: 16px; border: 1px solid var(--border-color); padding: 24px; width: 100%; max-width: 640px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); box-sizing: border-box; }
            .header-group { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border-color); padding-bottom: 16px; margin-bottom: 20px; }
            h2 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.5px; }
            .status-badge { font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
            .badge-success { background: rgba(52,199,89,0.15); color: var(--accent-color); }
            .badge-empty { background: rgba(255,149,0,0.15); color: #ff9500; }
            .meta-row { font-size: 13px; color: var(--text-muted); margin: 6px 0; display: flex; justify-content: space-between; }
            .meta-val { color: var(--text-main); font-family: monospace; }
            .console-box { background: #000000; border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; overflow-y: auto; max-height: 350px; margin-top: 20px; color: #e1e1e3; }
            .btn { display: block; width: 100%; height: 48px; background: var(--accent-color); color: #ffffff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; margin-top: 24px; cursor: pointer; transition: all 0.2s ease; }
            .btn:active { transform: scale(0.98); opacity: 0.9; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header-group">
                <div>
                    <h2>MITM 实时监控控制台</h2>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">iPadOS 沙盒托管虚拟环境</div>
                </div>
                <span class="status-badge ${data.status === 'success' ? 'badge-success' : 'badge-empty'}">
                    ${data.status === 'success' ? 'ACTIVE' : 'IDLE'}
                </span>
            </div>
            
            <div class="meta-row"><span>虚拟宿主域名</span><span class="meta-val" style="color:#007aff;">neverssl.com/mybox</span></div>
            <div class="meta-row"><span>捕获数据源</span><span class="meta-val">${data.source || 'None'}</span></div>
            <div class="meta-row"><span>最后同步时间</span><span class="meta-val">${data.time || 'N/A'}</span></div>
            
            <div class="console-box">${data.status === 'success' ? data.content : `[SYSTEM INF]: ${data.message}`}</div>
            
            <button class="btn" onclick="window.location.reload()">刷新数据缓存</button>
        </div>
    </body>
    </html>
    `;

    // 伪造 200 OK 拦截并吐回我们定制的 HTML 页面
    $done({
        response: {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
            body: html
        }
    });
} else {
    $done({});
}

// ==================== 3. 递归清洗 Google 复杂多维嵌套数组 ====================
function extractGeminiText(arr) {
    if (!arr || !Array.isArray(arr)) return null;
    for (let item of arr) {
        // 甄别特征节点：内嵌的转义字符串且包含特定的后端响应路由标志
        if (typeof item === 'string' && (item.includes('model_version') || item.includes('generic_bot_response'))) {
            try {
                let parsed = JSON.parse(item);
                // 沿着谷歌极其复杂的固定响应索引链一步步探寻核心文本
                let text = parsed?.[1]?.[0]?.[0]?.[1]?.[0];
                if (text) return text;
            } catch(e) {}
        }
        if (Array.isArray(item)) {
            let res = extractGeminiText(item);
            if (res) return res;
        }
    }
    return null;
}

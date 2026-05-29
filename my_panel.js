/**
 * 脚本名称：MITM 数据捕获与本地看板一体化脚本
 * 适用客户端：Shadowrocket (小火箭)
 */

const url = $request.url;

// ==================== [ 核心配置项 ] ====================
// 1. 你想要抓取的目标 App 的 API 域名或路径关键词
const TARGET_API_KEYWORDS = "api.example.com/v1/data"; 

// 2. 你自定义在浏览器里访问的虚拟域名
const MY_PANEL_URL = "http://neverssl.com/mybox";

// 3. 存储在小火箭内部沙盒里的数据库 Key 名
const STORAGE_KEY = "mitm_data_pool";
// =========================================================


// 路由分支 1：数据收集阶段 (拦截目标 App 的 Response 响应体)
if (url.includes(TARGET_API_KEYWORDS)) {
    if (typeof $response !== "undefined" && $response.body) {
        const dataToSave = $response.body;
        
        // 写入小火箭本地持久化存储
        const isSaved = $persistentStore.write(dataToSave, STORAGE_KEY);
        if (isSaved) {
            console.log("[MITM 成功] 已成功捕获并覆盖本地数据");
        } else {
            console.log("[MITM 失败] 数据写入本地失败，可能体积过大");
        }
    }
    $done({}); 
}

// 路由分支 2：网页渲染阶段 (拦截浏览器对虚拟域名的 Request 请求)
else if (url.includes(MY_PANEL_URL)) {
    // 从本地沙盒读取之前存下来的数据
    const localRawData = $persistentStore.read(STORAGE_KEY) || '{"status": "empty", "message": "暂无捕获数据，请先去目标 App 里触发对应接口"}';
    
    // 尝试将数据格式化
    let displayData = localRawData;
    try {
        displayData = JSON.stringify(JSON.parse(localRawData), null, 4);
    } catch (e) {
        // 如果抓到的不是标准 JSON，则保持原样
    }

    // 动态构建返回给 iPad 浏览器的 HTML 前端页面
    const htmlPage = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>iPadOS 本地抓包看板</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; background: #f5f5f7; color: #1d1d1f; margin: 0; }
            .wrapper { max-width: 900px; margin: 30px auto; background: #ffffff; padding: 35px; border-radius: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.05); }
            header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e5ea; padding-bottom: 15px; margin-bottom: 25px; }
            h1 { font-size: 26px; font-weight: 600; color: #0071e3; margin: 0; }
            .badge { background: #e3f2fd; color: #0d47a1; font-size: 12px; padding: 5px 12px; border-radius: 12px; font-weight: 500; }
            .meta-info { font-size: 13px; color: #86868b; margin-bottom: 15px; }
            .code-container { position: relative; background: #1c1c1e; border-radius: 12px; padding: 20px; overflow: hidden; box-shadow: inset 0 2px 8px rgba(0,0,0,0.15); }
            pre { margin: 0; color: #30d158; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; max-height: 550px; overflow-y: auto; }
            .btn-group { margin-top: 25px; display: flex; gap: 15px; }
            .btn { background: #0071e3; color: white; border: none; padding: 12px 24px; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
            .btn:hover { background: #0077ed; transform: translateY(-1px); }
            .btn-secondary { background: #e5e5ea; color: #1d1d1f; }
            .btn-secondary:hover { background: #d1d1d6; }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <header>
                <h1>MITM 实时监控控制台</h1>
                <span class="badge">iPadOS 沙盒托管</span>
            </header>
            
            <div class="meta-info">
                <strong>虚拟控制域名：</strong> <code>${MY_PANEL_URL}</code><br>
                <strong>数据更新时间：</strong> ${new Date().toLocaleString()}
            </div>

            <div class="code-container">
                <pre><code>${displayData}</code></pre>
            </div>

            <div class="btn-group">
                <button class="btn" onclick="window.location.reload()">刷新当前数据</button>
                <button class="btn btn-secondary" onclick="clearData()">清空本地缓存</button>
            </div>
        </div>

        <script>
            function clearData() {
                if(confirm("确定要清空本地保存的缓存数据吗？")) {
                    alert("提示：请在小火箭内手动清除或等待新数据覆盖。");
                }
            }
        </script>
    </body>
    </html>
    `;

    $done({
        response: {
            status: 200,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-cache"
            },
            body: htmlPage
        }
    });
} 

// 🚀 路由分支 3：兜底放行
else {
    $done({});
}

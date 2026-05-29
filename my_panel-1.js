// 全局抓取逻辑
if (typeof $response !== "undefined") {
    let body = $response.body;
    // 只记录网页内容 (text/html) 或 JSON，避免把图片、视频等二进制数据存入导致沙盒溢出
    if ($response.headers['Content-Type']?.includes('text') || $response.headers['Content-Type']?.includes('json')) {
        let cacheData = {
            url: $request.url,
            time: new Date().toLocaleTimeString(),
            // 截取响应体前 500 个字符用于显示
            content: typeof body === 'string' ? body.substring(0, 500) : "Binary/Complex Data"
        };
        $persistentStore.write(JSON.stringify(cacheData), "global_log");
    }
    $done({ body: $response.body });
} 

// 网页显示逻辑 (neverssl.com/mybox)
else if (typeof $request !== "undefined" && $request.url.includes("neverssl.com/mybox")) {
    let saved = $persistentStore.read("global_log");
    let data = saved ? JSON.parse(saved) : { url: "无", content: "暂无最新流量" };
    
    let html = `
    <html><body>
        <h1>全局实时监控</h1>
        <p><b>最新捕获 URL:</b> ${data.url}</p>
        <div style="background:#000; color:#0f0; padding:10px; font-size:12px;">${data.content}</div>
        <button onclick="window.location.reload()">刷新</button>
    </body></html>`;
    
    $done({ response: { status: 200, headers: { "Content-Type": "text/html" }, body: html } });
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.end(JSON.stringify(data));
}

function extractJson(text) {
  if (!text) return null;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const candidate = text.slice(first, last + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {
      return null;
    }
  }
  return null;
}

function clampText(value, maxLen) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    json(res, 500, { error: "Missing OPENAI_API_KEY in server environment" });
    return;
  }

  let body = "";
  await new Promise((resolve) => {
    req.on("data", (chunk) => (body += chunk));
    req.on("end", resolve);
  });

  let payload;
  try {
    payload = JSON.parse(body || "{}");
  } catch (_) {
    json(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const meta = payload.meta || {};
  const selectedPages = Array.isArray(payload.selectedPages) ? payload.selectedPages.map((n) => Number(n)).filter(Boolean) : [];
  const pageIssues = Array.isArray(payload.pageIssues) ? payload.pageIssues : [];
  const pages = Array.isArray(payload.pages) ? payload.pages : [];

  if (!selectedPages.length || !pages.length) {
    json(res, 400, { error: "Missing selected pages or page contents" });
    return;
  }

  const course = clampText(meta.course || "未命名课程", 80);
  const chapter = clampText(meta.chapter || "未命名章节", 80);
  const mode = clampText(meta.mode || "平衡更新", 20);
  const goal = clampText(meta.goal || "", 300);
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const compactIssues = pageIssues
    .slice(0, 10)
    .map((item) => ({
      page: Number(item.page || 0),
      priority: clampText(item.priority || "中", 10),
      issues: Array.isArray(item.issues) ? item.issues.slice(0, 6) : [],
      suggestion: clampText(item.suggestion || "", 700)
    }));

  const compactPages = pages
    .slice(0, 10)
    .map((item) => ({
      page: Number(item.page || 0),
      text: clampText(item.text || "", 2200)
    }));

  const system = `
你是“课程更新雷达智能体”的页面改写引擎。
你的任务是：基于指定页的原文和更新问题，重写该页的文字内容，用于覆盖原 PDF 的文字层。
必须输出严格 JSON，不要 Markdown，不要多余解释，格式如下：
{
  "rewrites": [
    {
      "page": 1,
      "rewrittenText": "重写后的整页文字",
      "rationale": "本页为什么这样改（1-2句）"
    }
  ]
}
要求：
1. 只改被指定的页，不要新增不存在的页码。
2. rewrittenText 要尽量保留“原页主题”，但内容更新为更适合当前教学的版本。
3. 文字长度尽量接近原文，不要极端变长，避免溢出版面。
4. 语气保持正式、清晰、适合课件页面，不要写成口语长段落。
5. 若原文过旧，优先更新案例、数据、表述、活动设计；不要胡乱扩写。
`.trim();

  const user = `
课程：${course}
章节：${chapter}
更新深度：${mode}
教学目标：${goal || "（未提供）"}
指定改写页：${selectedPages.map((page) => `第${page}页`).join("、")}

页面问题：
${compactIssues
  .map(
    (item) =>
      `【第${item.page}页】优先级：${item.priority}；问题：${item.issues.join("、")}；建议：${item.suggestion}`
  )
  .join("\n")}

原始页面文本：
${compactPages.map((item) => `【第${item.page}页】${item.text || "（空）"}`).join("\n\n")}
`.trim();

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      json(res, 502, { error: "LLM request failed", status: resp.status, detail: text.slice(0, 2000) });
      return;
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch (_) {
      parsed = extractJson(content);
    }

    if (!parsed || !Array.isArray(parsed.rewrites)) {
      json(res, 502, { error: "LLM returned non-JSON", raw: content.slice(0, 2000) });
      return;
    }

    json(res, 200, { ok: true, rewrites: parsed.rewrites });
  } catch (error) {
    json(res, 500, { error: "Server error", detail: String(error) });
  }
};

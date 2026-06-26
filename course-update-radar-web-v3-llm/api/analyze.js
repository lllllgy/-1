/**
 * Vercel Serverless Function
 * POST /api/analyze
 *
 * Env:
 * - OPENAI_API_KEY: required
 * - OPENAI_BASE_URL: optional, default https://api.openai.com/v1
 * - OPENAI_MODEL: optional, default gpt-4o-mini
 */

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

function clampText(s, maxLen) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > maxLen ? t.slice(0, maxLen) + "…" : t;
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
  } catch (e) {
    json(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const meta = payload.meta || {};
  const pages = Array.isArray(payload.pages) ? payload.pages : [];

  // 防止超大请求：限制页数与每页长度（可按需调整）
  const MAX_PAGES = 30;
  const MAX_CHARS_PER_PAGE = 1600;
  const trimmedPages = pages.slice(0, MAX_PAGES).map((p) => ({
    page: Number(p.page || 0) || 0,
    text: clampText(p.text, MAX_CHARS_PER_PAGE),
  }));

  const course = clampText(meta.course || "未命名课程", 80);
  const chapter = clampText(meta.chapter || "未命名章节", 80);
  const mode = clampText(meta.mode || "平衡更新", 20);
  const goal = clampText(meta.goal || "", 300);

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = `
你是“课程更新雷达智能体”的分析引擎。你的任务不是泛泛总结，而是基于课程文件逐页内容，输出可落地、可教学的更新建议。
必须输出严格JSON（不要Markdown、不要代码块、不要多余文字），字段如下：
{
  "riskLevel": "低|中|中高|高",
  "summary": "1-3句话总体判断（不要空话）",
  "pageIssues": [
    {
      "page": 1,
      "priority": "高|中|低",
      "issueTypes": ["案例或场景偏旧","数据可能过期","工具或平台逻辑迭代","缺少当前语境补充","课堂任务设计偏旧","表达不清/结构不佳","概念错误/不严谨"],
      "why": "为什么这页需要更新（2-4句）",
      "whatToChange": "具体改哪里（尽量指出：标题/案例/数据/活动/表述等）",
      "replaceWith": ["建议替换成什么方向（可列1-3条）"],
      "quickFix": "最快的一步修复建议（1句）"
    }
  ],
  "teachingPack": {
    "intro": "课堂导入（3-5句）",
    "discussion": "讨论题（3条以内）",
    "exercise": "练习题/作业（1-2条）",
    "ppt": "一页PPT讲稿草案（5-8句）"
  }
}
要求：pageIssues按priority从高到低排序；不要臆造不存在的页码；如果某页内容不足以判断，issueTypes可含“表达不清/结构不佳”并给出补全建议。
`.trim();

  const user = `
课程：${course}
章节：${chapter}
更新深度：${mode}
教学目标：${goal || "（未提供）"}

以下是逐页文本（最多${MAX_PAGES}页，每页已截断）：\n
${trimmedPages
  .map((p) => `【第${p.page}页】 ${p.text || "（空）"}`)
  .join("\n\n")}
`.trim();

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      json(res, 502, { error: "LLM request failed", status: resp.status, detail: t.slice(0, 2000) });
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
    if (!parsed) {
      json(res, 502, { error: "LLM returned non-JSON", raw: content.slice(0, 2000) });
      return;
    }

    json(res, 200, { ok: true, result: parsed });
  } catch (e) {
    json(res, 500, { error: "Server error", detail: String(e) });
  }
};


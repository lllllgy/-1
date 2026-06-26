const demoFiles = {
  marketing: `
第1页：市场营销课程 品牌传播章节
第2页：课程目标：理解品牌传播的基本概念、传统广告投放方式与品牌识别逻辑。
第3页：案例：2019年某品牌电视广告投放案例，重点分析电视媒体覆盖率与广告重复曝光效果。
第4页：知识点：海报投放、电视广告、门户网站广告位、单向传播模型。
第5页：课堂活动：围绕传统广告创意进行小组讨论。
第6页：课后作业：分析一个你熟悉的品牌在传统媒体上的传播方式。
第7页：参考数据：2018-2019年用户收视率与传统广告触达数据。
第8页：课程总结：传统广告依然是品牌传播的重要方式。
  `.trim(),
  ecommerce: `
第1页：电子商务课程 平台运营策略
第2页：课程目标：理解平台运营的基本流程与店铺流量获取方式。
第3页：案例：早期PC电商平台店铺装修与搜索流量优化案例。
第4页：知识点：价格竞争、搜索排名、详情页设计、货架式展示。
第5页：课堂活动：分析如何通过搜索关键词提升点击率。
第6页：课后作业：比较两个传统电商店铺页面的视觉设计。
  `.trim(),
  ai: `
第1页：人工智能导论 人工智能应用场景
第2页：课程目标：理解人工智能在教育、医疗和工业中的主要应用。
第3页：案例：专家系统在医疗诊断中的应用。
第4页：知识点：规则库、知识工程、图像识别、语音识别。
第5页：课堂活动：讨论传统人工智能与人类专家的差异。
第6页：课后作业：举例说明一个你熟悉的人工智能应用。
  `.trim()
};

const refs = {
  fileInput: document.getElementById("fileInput"),
  fileMeta: document.getElementById("fileMeta"),
  courseName: document.getElementById("courseName"),
  chapterName: document.getElementById("chapterName"),
  updateMode: document.getElementById("updateMode"),
  teachingGoal: document.getElementById("teachingGoal"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  useDemoFile: document.getElementById("useDemoFile"),
  useDemoOutput: document.getElementById("useDemoOutput"),
  copySummary: document.getElementById("copySummary"),
  progressItems: [...document.querySelectorAll(".progress-item")],
  runState: document.getElementById("runState"),
  fileNameDisplay: document.getElementById("fileNameDisplay"),
  pageCountDisplay: document.getElementById("pageCountDisplay"),
  flaggedCountDisplay: document.getElementById("flaggedCountDisplay"),
  riskLevelDisplay: document.getElementById("riskLevelDisplay"),
  summaryText: document.getElementById("summaryText"),
  pageReportList: document.getElementById("pageReportList"),
  pagePreviewList: document.getElementById("pagePreviewList"),
  introOutput: document.getElementById("introOutput"),
  discussionOutput: document.getElementById("discussionOutput"),
  exerciseOutput: document.getElementById("exerciseOutput"),
  pptOutput: document.getElementById("pptOutput")
};

const tabButtons = [...document.querySelectorAll(".tab-btn")];
const tabPanels = [...document.querySelectorAll(".tab-panel")];

let uploadedFile = null;
let parsedPages = [];
let currentDemoKey = "marketing";
let lastResult = null;

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

refs.fileInput.addEventListener("change", handleFileSelected);
refs.analyzeBtn.addEventListener("click", analyzeCurrentInput);
refs.useDemoFile.addEventListener("click", loadCurrentDemoFile);
refs.useDemoOutput.addEventListener("click", () => analyzeCurrentInput(true));
refs.copySummary.addEventListener("click", copySummary);

document.querySelectorAll("[data-demo]").forEach((button) => {
  button.addEventListener("click", () => {
    currentDemoKey = button.dataset.demo;
    fillMetaByDemo(button.dataset.demo);
  });
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tabButtons.forEach((btn) => btn.classList.remove("active"));
    tabPanels.forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`[data-panel="${button.dataset.tab}"]`).classList.add("active");
  });
});

fillMetaByDemo("marketing");

function fillMetaByDemo(key) {
  const demos = {
    marketing: {
      course: "市场营销",
      chapter: "品牌传播",
      goal: "希望学生理解传统广告投放与当下内容营销、算法分发、私域转化之间的差异，并能够分析品牌在新媒体环境中的传播路径。"
    },
    ecommerce: {
      course: "电子商务",
      chapter: "平台运营策略",
      goal: "希望学生理解平台运营从PC货架逻辑走向内容逻辑的变化，并能分析平台流量结构如何变化。"
    },
    ai: {
      course: "人工智能导论",
      chapter: "人工智能应用场景",
      goal: "希望学生认识传统AI案例与生成式人工智能、智能体应用之间的演进关系。"
    }
  };

  refs.courseName.value = demos[key].course;
  refs.chapterName.value = demos[key].chapter;
  refs.teachingGoal.value = demos[key].goal;
  refs.updateMode.value = key === "ecommerce" ? "深度更新" : "平衡更新";
}

async function handleFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  uploadedFile = file;
  parsedPages = [];
  updateFileMeta(file.name, "--", "文件已选择，等待分析");
}

function loadCurrentDemoFile() {
  const text = demoFiles[currentDemoKey];
  uploadedFile = new File([text], `${currentDemoKey}_demo.txt`, { type: "text/plain" });
  updateFileMeta(uploadedFile.name, text.split(/\n/).length.toString(), "已加载内置样例");
}

async function analyzeCurrentInput(forceDemo = false) {
  if (forceDemo && !uploadedFile) {
    loadCurrentDemoFile();
  }
  if (!uploadedFile) {
    alert("请先上传课程文件，或点击“使用内置样例”。");
    return;
  }

  resetProgress();
  refs.runState.textContent = "分析中";

  try {
    stepTo(1);
    parsedPages = await parseFile(uploadedFile);

    stepTo(2);
    renderPagePreviews(parsedPages);

    stepTo(3);
    const meta = {
      course: refs.courseName.value.trim() || "未命名课程",
      chapter: refs.chapterName.value.trim() || "未命名章节",
      goal: refs.teachingGoal.value.trim(),
      mode: refs.updateMode.value
    };

    // 优先走真实大模型分析；若后端未配置，则回退到原型规则分析
    const result = await analyzeByLLM(parsedPages, meta).catch(() => null);
    const finalResult = result || generatePageDiagnosis(parsedPages, meta);

    stepTo(4);
    renderAnalysisResult(uploadedFile.name, parsedPages, finalResult, Boolean(result));
    refs.runState.textContent = "分析完成";
  } catch (error) {
    console.error(error);
    refs.runState.textContent = "分析失败";
    alert("文件读取失败。当前原型建议优先上传 PDF 或 TXT 文件。");
  }
}

async function analyzeByLLM(pages, meta) {
  const resp = await fetch("./api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages, meta })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.error || "LLM analyze failed");
  }
  return normalizeLLMResult(data.result, meta);
}

function normalizeLLMResult(llm, meta) {
  // 将后端返回的更细结构，映射为前端渲染所需字段
  const pageIssues = Array.isArray(llm.pageIssues) ? llm.pageIssues : [];
  const flaggedPages = pageIssues.map((p) => p.page).filter(Boolean);
  const pack = llm.teachingPack || buildTeachingPack(meta, []);

  return {
    summary: llm.summary || "已完成大模型分析。",
    riskLevel: llm.riskLevel || "中",
    flaggedPages,
    pageIssues: pageIssues.map((p) => ({
      page: p.page,
      preview: "",
      issues: p.issueTypes || [],
      suggestion: [
        `原因：${p.why || ""}`,
        `建议修改：${p.whatToChange || ""}`,
        `替换方向：${Array.isArray(p.replaceWith) ? p.replaceWith.join("；") : (p.replaceWith || "")}`,
        `最快修复：${p.quickFix || ""}`
      ].filter(Boolean).join(" ")
    })),
    pack: {
      intro: pack.intro || "",
      discussion: pack.discussion || "",
      exercise: pack.exercise || "",
      ppt: pack.ppt || ""
    },
    __fromLLM: true
  };
}

async function parseFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return await parsePdf(file);
  }
  return await parseTxt(file);
}

async function parsePdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
    pages.push({
      page: i,
      text: text || "该页未提取到有效文本。"
    });
  }

  return pages;
}

async function parseTxt(file) {
  const text = await file.text();
  const lines = text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const explicitPages = [];
  let currentPage = null;
  lines.forEach((line) => {
    const match = line.match(/^第(\d+)页[:：]?\s*(.*)$/);
    if (match) {
      if (currentPage) explicitPages.push(currentPage);
      currentPage = { page: Number(match[1]), text: match[2] || "" };
    } else if (currentPage) {
      currentPage.text += ` ${line}`;
    }
  });
  if (currentPage) explicitPages.push(currentPage);

  if (explicitPages.length) {
    return explicitPages;
  }

  return [
    {
      page: 1,
      text: text.replace(/\s+/g, " ").trim()
    }
  ];
}

function generatePageDiagnosis(pages, meta) {
  const flaggedPages = [];
  const pageIssues = [];

  pages.forEach((pageItem) => {
    const issues = detectIssues(pageItem.text, meta);
    if (issues.length) {
      const unique = [...new Set(issues)];
      flaggedPages.push(pageItem.page);
      pageIssues.push({
        page: pageItem.page,
        preview: shorten(pageItem.text, 120),
        issues: unique,
        suggestion: buildSuggestion(unique, meta, pageItem.text)
      });
    }
  });

  const riskLevel =
    flaggedPages.length >= Math.max(4, Math.ceil(pages.length * 0.45))
      ? "高"
      : flaggedPages.length >= Math.max(2, Math.ceil(pages.length * 0.2))
      ? "中高"
      : flaggedPages.length > 0
      ? "中"
      : "低";

  const summary =
    flaggedPages.length === 0
      ? `系统暂未发现《${meta.course}》“${meta.chapter}”中存在明显的过时页内容，但仍建议结合最新案例补充课堂活动与讨论题。`
      : `系统共读取 ${pages.length} 页内容，判断其中 ${flaggedPages.length} 页存在较明显的更新需求，主要集中在 ${flaggedPages.map((p) => `第${p}页`).join("、")}。建议采用“${meta.mode}”策略，优先替换旧案例、旧数据和旧平台语境，并同步调整课堂互动与练习设计。`;

  const pack = buildTeachingPack(meta, pageIssues);

  return {
    summary,
    riskLevel,
    flaggedPages,
    pageIssues,
    pack
  };
}

function detectIssues(text, meta) {
  const issues = [];
  const content = `${text} ${meta.goal}`.toLowerCase();

  if (/(2018|2019|2020|2021|早期|传统|旧版|经典案例|门户网站|电视广告|海报|单向传播|pc)/i.test(content)) {
    issues.push("案例或场景偏旧");
  }
  if (/(收视率|统计数据|参考数据|调研数据|市场份额|2018|2019|2020|2021)/i.test(content)) {
    issues.push("数据可能过期");
  }
  if (/(专家系统|规则库|货架式|搜索排名|店铺装修|传统媒体|电视媒体)/i.test(content)) {
    issues.push("工具或平台逻辑迭代");
  }
  if (!/(短视频|直播|私域|算法|aigc|智能体|生成式|内容营销|互动)/i.test(content) && /(品牌传播|平台运营|人工智能|营销|电商)/i.test(content)) {
    issues.push("缺少当前语境补充");
  }
  if (/(讨论|作业|课堂活动)/i.test(content) && !/(辩论|热点|对比|链路|转化|新场景)/i.test(content)) {
    issues.push("课堂任务设计偏旧");
  }

  return issues;
}

function buildSuggestion(issues, meta, pageText) {
  const suggestions = [];

  if (issues.includes("案例或场景偏旧")) {
    suggestions.push(`建议把本页旧案例替换为与“${meta.chapter}”相关的近两年真实案例，并保留原知识点框架。`);
  }
  if (issues.includes("数据可能过期")) {
    suggestions.push("建议更新为近两年的行业数据、平台数据或用户行为数据，并标注数据来源。");
  }
  if (issues.includes("工具或平台逻辑迭代")) {
    suggestions.push("建议补充当前平台机制、传播路径或工具变化，避免继续沿用旧平台逻辑解释当前场景。");
  }
  if (issues.includes("缺少当前语境补充")) {
    suggestions.push(`建议在本页新增与“${meta.chapter}”对应的现代表达，如短视频、内容分发、AIGC或智能体应用等。`);
  }
  if (issues.includes("课堂任务设计偏旧")) {
    suggestions.push("建议把本页课堂活动改为热点对比、案例诊断或策略设计任务，增强学生参与感。");
  }

  if (/品牌传播|营销/.test(pageText)) {
    suggestions.push("可补充短视频平台品牌传播、内容种草与私域转化案例。");
  }
  if (/平台运营|电商/.test(pageText)) {
    suggestions.push("可补充直播电商、内容电商与平台流量结构变化案例。");
  }
  if (/人工智能|专家系统|规则库/.test(pageText)) {
    suggestions.push("可补充生成式人工智能、教育智能体与多智能体协同应用案例。");
  }

  return [...new Set(suggestions)].join("");
}

function buildTeachingPack(meta, pageIssues) {
  const focusPages = pageIssues.slice(0, 3).map((item) => `第${item.page}页`).join("、") || "重点页";
  return {
    intro: `课堂导入建议：先展示与“${meta.chapter}”相关的近期案例，再让学生比较旧材料与当前场景之间的差异。导入时可重点引用 ${focusPages} 的旧内容，引导学生思考为什么课程知识需要进入新的现实语境。`,
    discussion: `讨论题建议：\n1. ${focusPages} 为什么会成为本章节最需要更新的内容？\n2. 如果保留原有知识点框架，哪些案例、平台或数据必须替换？\n3. 在今天的教学场景中，这一章节应该如何设计成更能引发学生参与的课堂活动？`,
    exercise: `练习题建议：请任选一个被标记页，完成“原页问题识别—更新理由—新案例替换—课堂应用设计”四步分析，并输出一份课程焕新微方案。`,
    ppt: `PPT讲稿草案：本节课将以 ${focusPages} 为重点更新对象。先说明旧内容所对应的原始语境，再展示平台机制、用户行为或技术条件的变化，最后总结：课程更新不是推翻旧知识，而是让知识在今天的场景里重新变得可理解、可应用。`
  };
}

function renderAnalysisResult(fileName, pages, result, fromLLM) {
  lastResult = result;
  refs.fileNameDisplay.textContent = fileName;
  refs.pageCountDisplay.textContent = `${pages.length} 页`;
  refs.flaggedCountDisplay.textContent = `${(result.flaggedPages || []).length} 页`;
  refs.riskLevelDisplay.textContent = `${result.riskLevel}${fromLLM ? "（大模型）" : "（原型）"}`;
  refs.summaryText.textContent = result.summary;

  refs.pageReportList.innerHTML = (result.pageIssues || []).length
    ? (result.pageIssues || [])
        .map(
          (item) => `
        <article class="page-card">
          <div class="page-card-head">
            <h3>第 ${item.page} 页建议更新</h3>
            <span class="chip">建议优先处理</span>
          </div>
          <div class="tag-row">
            ${item.issues.map((issue) => `<span class="tag">${issue}</span>`).join("")}
          </div>
          ${item.preview ? `<p><strong>页内容摘要：</strong>${item.preview}</p>` : ""}
          <p style="margin-top:10px;"><strong>更新建议：</strong>${item.suggestion}</p>
        </article>`
        )
        .join("")
    : `<div class="empty-state"><img src="./assets/course_evolution_radar.jpg" alt="课程持续进化图" /><p>当前未检测到必须立刻更新的页内容，可以继续补充新案例和课堂任务设计。</p></div>`;

  refs.introOutput.textContent = result.pack.intro;
  refs.discussionOutput.textContent = result.pack.discussion;
  refs.exerciseOutput.textContent = result.pack.exercise;
  refs.pptOutput.textContent = result.pack.ppt;
}

function renderPagePreviews(pages) {
  refs.pagePreviewList.innerHTML = pages
    .slice(0, 8)
    .map(
      (item) => `
        <article class="preview-card">
          <h3>第 ${item.page} 页</h3>
          <p>${shorten(item.text, 180)}</p>
        </article>
      `
    )
    .join("");
}

function updateFileMeta(name, pageCount, statusText) {
  refs.fileMeta.innerHTML = `
    <div>
      <span>当前状态</span>
      <strong>${name || statusText}</strong>
    </div>
    <div>
      <span>页数</span>
      <strong>${pageCount}</strong>
    </div>
  `;
}

function resetProgress() {
  refs.progressItems.forEach((item, index) => {
    item.classList.remove("done", "active");
    if (index === 0) item.classList.add("active");
  });
}

function stepTo(stepNumber) {
  refs.progressItems.forEach((item, index) => {
    item.classList.toggle("done", index < stepNumber);
    item.classList.toggle("active", index === stepNumber);
  });
}

async function copySummary() {
  const pageTexts = [...document.querySelectorAll(".page-card")]
    .map((card) => card.innerText.replace(/\n+/g, "\n"))
    .join("\n\n");
  const text = [
    `文件：${refs.fileNameDisplay.textContent}`,
    `总页数：${refs.pageCountDisplay.textContent}`,
    `需更新页数：${refs.flaggedCountDisplay.textContent}`,
    `风险等级：${refs.riskLevelDisplay.textContent}`,
    `总体判断：${refs.summaryText.textContent}`,
    `按页诊断：\n${pageTexts}`,
    `课堂导入：${refs.introOutput.textContent}`,
    `讨论题：${refs.discussionOutput.textContent}`,
    `练习题：${refs.exerciseOutput.textContent}`,
    `PPT讲稿：${refs.pptOutput.textContent}`
  ].join("\n\n");

  try {
    await navigator.clipboard.writeText(text);
    refs.runState.textContent = "摘要已复制";
  } catch {
    alert("复制失败，请手动复制页面内容。");
  }
}

function shorten(text, length) {
  if (!text) return "未提取到有效文本。";
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

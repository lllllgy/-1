(function () {
if (window.__HUANXIN_MAIN_V4__) return;
window.__HUANXIN_MAIN_V4__ = true;

const STORAGE_KEY = "courseUpdateRadarV4Memory";

const refs = {
  fileInput: document.getElementById("fileInput"),
  fileMeta: document.getElementById("fileMeta"),
  courseName: document.getElementById("courseName"),
  chapterName: document.getElementById("chapterName"),
  updateMode: document.getElementById("updateMode"),
  teachingGoal: document.getElementById("teachingGoal"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  copySummary: document.getElementById("copySummary"),
  runState: document.getElementById("runState"),
  progressItems: [...document.querySelectorAll(".progress-item")],
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
  pptOutput: document.getElementById("pptOutput"),
  exportPdfBtn: document.getElementById("exportPdfBtn"),
  rewriteStatus: document.getElementById("rewriteStatus"),
  rewriteCountDisplay: document.getElementById("rewriteCountDisplay"),
  rewritePreviewList: document.getElementById("rewritePreviewList"),
  historyList: document.getElementById("historyList"),
  historyCount: document.getElementById("historyCount"),
  historyDetail: document.getElementById("historyDetail"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  enterWorkbench: document.getElementById("enterWorkbench"),
  workbench: document.getElementById("workbench"),
  bookShowcase: document.getElementById("bookShowcase")
};

const tabButtons = [...document.querySelectorAll(".tab-btn")];
const tabPanels = [...document.querySelectorAll(".tab-panel")];

let uploadedFile = null;
let parsedPages = [];
let lastResult = null;
let rewriteDraft = [];
let historyRecords = loadHistoryRecords();
let activeHistoryId = historyRecords[0]?.id || null;

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

refs.fileInput.addEventListener("change", handleFileSelected);
refs.analyzeBtn.addEventListener("click", analyzeCurrentInput);
refs.copySummary.addEventListener("click", copySummary);
refs.exportPdfBtn.addEventListener("click", handleRewriteExport);
refs.clearHistoryBtn.addEventListener("click", clearHistoryRecords);
refs.enterWorkbench.addEventListener("click", () => {
  refs.workbench.scrollIntoView({ behavior: "smooth", block: "start" });
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tabButtons.forEach((btn) => btn.classList.remove("active"));
    tabPanels.forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`[data-panel="${button.dataset.tab}"]`)?.classList.add("active");
  });
});

setupRevealObserver();
setupBookInteractions();
renderHistory();
resetResultsPanels();
updateRewriteSelectionSummary();

async function handleFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  uploadedFile = file;
  parsedPages = [];
  lastResult = null;
  rewriteDraft = [];

  updateFileMeta(file.name, "--", "文件已选择");
  refs.runState.textContent = "文件已就绪";
  refs.rewriteStatus.textContent = "尚未生成新版 PDF。";
  resetResultsPanels();
}

async function analyzeCurrentInput() {
  if (!uploadedFile) {
    alert("请先上传课程文件。");
    return;
  }

  resetProgress();
  refs.runState.textContent = "分析中";
  refs.rewriteStatus.textContent = "请先完成分析，再进行自动改写。";
  rewriteDraft = [];
  renderRewritePreview([]);

  try {
    stepTo(1);
    parsedPages = await parseFile(uploadedFile);
    updateFileMeta(uploadedFile.name, String(parsedPages.length), "文件已读取");

    stepTo(2);
    renderPagePreviews(parsedPages);

    stepTo(3);
    const meta = collectMeta();
    const result = await analyzeByLLM(parsedPages, meta);

    stepTo(4);
    renderAnalysisResult(uploadedFile.name, parsedPages, result, true);
    refs.runState.textContent = "分析完成";
    saveHistoryRecord(uploadedFile.name, meta, parsedPages, result);
  } catch (error) {
    console.error(error);
    refs.runState.textContent = "分析失败";
    refs.rewriteStatus.textContent = "分析失败，无法生成新版 PDF。";
    alert(error?.message || "文件读取或分析失败，请确认文件格式和网络配置。");
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
    throw new Error(data?.error || data?.detail || "大模型分析失败");
  }
  return normalizeLLMResult(data.result, meta);
}

function normalizeLLMResult(llm, meta) {
  const pageIssues = Array.isArray(llm.pageIssues) ? llm.pageIssues : [];
  const pack = llm.teachingPack || {};

  return {
    summary: llm.summary || `已完成《${meta.course}》的分析。`,
    riskLevel: llm.riskLevel || "中",
    flaggedPages: pageIssues.map((item) => item.page).filter(Boolean),
    pageIssues: pageIssues.map((item) => ({
      page: item.page,
      priority: item.priority || "中",
      preview: "",
      issues: Array.isArray(item.issueTypes) ? item.issueTypes : [],
      suggestion: [
        item.why ? `原因：${item.why}` : "",
        item.whatToChange ? `建议修改：${item.whatToChange}` : "",
        item.replaceWith
          ? `替换方向：${Array.isArray(item.replaceWith) ? item.replaceWith.join("；") : item.replaceWith}`
          : "",
        item.quickFix ? `最快修复：${item.quickFix}` : ""
      ]
        .filter(Boolean)
        .join("\n"),
      raw: item
    })),
    pack: {
      intro: toDisplayBlock(pack.intro),
      discussion: toDisplayBlock(pack.discussion),
      exercise: toDisplayBlock(pack.exercise),
      ppt: toDisplayBlock(pack.ppt)
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
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items = textContent.items
      .filter((item) => String(item.str || "").trim())
      .map((item) => {
        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        const fontSize = Math.max(10, Math.abs(transform[3]) || item.height || 12);
        return {
          str: item.str,
          x: transform[4],
          y: transform[5],
          width: item.width || fontSize * Math.max(1, String(item.str || "").length * 0.56),
          height: item.height || fontSize,
          fontSize
        };
      });

    pages.push({
      page: i,
      text: items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim() || "该页未提取到有效文本。",
      items,
      pageWidth: viewport.width,
      pageHeight: viewport.height
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

  const pages = explicitPages.length
    ? explicitPages
    : [{ page: 1, text: text.replace(/\s+/g, " ").trim() }];

  return pages.map((item) => ({
    ...item,
    items: [],
    pageWidth: 0,
    pageHeight: 0
  }));
}

function renderAnalysisResult(fileName, pages, result, fromLLM) {
  lastResult = result;
  refs.fileNameDisplay.textContent = fileName;
  refs.pageCountDisplay.textContent = `${pages.length} 页`;
  refs.flaggedCountDisplay.textContent = `${(result.flaggedPages || []).length} 页`;
  refs.riskLevelDisplay.textContent = `${result.riskLevel}${fromLLM ? "（模型）" : ""}`;
  refs.summaryText.textContent = result.summary;

  refs.pageReportList.innerHTML = (result.pageIssues || []).length
    ? result.pageIssues
        .map((item) => {
          const sourcePage = pages.find((page) => page.page === item.page);
          const canRewrite = Boolean(sourcePage?.items?.length && /\.pdf$/i.test(uploadedFile?.name || ""));
          const preview = item.preview || shorten(sourcePage?.text || "", 160);
          const priorityLabel = `${item.priority || "中"}优先`;
          return `
            <article class="page-card">
              <div class="page-card-head">
                <div>
                  <h4>第 ${item.page} 页建议更新</h4>
                  <div class="card-tools">
                    <span class="chip subtle">${priorityLabel}</span>
                    ${canRewrite
                      ? `<label class="select-rewrite"><input type="checkbox" class="rewrite-checkbox" data-page="${item.page}" checked />纳入自动改写</label>`
                      : `<span class="chip subtle">当前页不可自动改写</span>`}
                  </div>
                </div>
              </div>
              <div class="tag-row">
                ${(item.issues || []).map((issue) => `<span class="tag">${escapeHtml(issue)}</span>`).join("")}
              </div>
              <p><strong>页内容摘要：</strong>${escapeHtml(preview || "未提取到有效文本。")}</p>
              <p><strong>更新建议：</strong>${escapeHtml(item.suggestion || "暂无建议").replace(/\n/g, "<br>")}</p>
            </article>
          `;
        })
        .join("")
    : `
        <div class="empty-state">
          <p>当前未检测到必须立刻更新的页内容，可以继续补充新案例、近两年数据和更强的课堂任务设计。</p>
        </div>
      `;

  refs.introOutput.textContent = result.pack.intro;
  refs.discussionOutput.textContent = result.pack.discussion;
  refs.exerciseOutput.textContent = result.pack.exercise;
  refs.pptOutput.textContent = result.pack.ppt;

  bindRewriteCheckboxes();
  updateRewriteSelectionSummary();
}

function renderPagePreviews(pages) {
  refs.pagePreviewList.innerHTML = pages.length
    ? pages
        .slice(0, 8)
        .map(
          (item) => `
            <article class="preview-card">
              <h4>第 ${item.page} 页</h4>
              <p>${escapeHtml(shorten(item.text, 220))}</p>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state compact"><p>还没有可预览的内容。</p></div>`;
}

function bindRewriteCheckboxes() {
  document.querySelectorAll(".rewrite-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", updateRewriteSelectionSummary);
  });
}

function updateFileMeta(name, pageCount, statusText) {
  refs.fileMeta.innerHTML = `
    <div>
      <span>当前状态</span>
      <strong>${escapeHtml(name || statusText)}</strong>
    </div>
    <div>
      <span>页数</span>
      <strong>${escapeHtml(pageCount)}</strong>
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

function resetResultsPanels() {
  refs.fileNameDisplay.textContent = "未载入";
  refs.pageCountDisplay.textContent = "--";
  refs.flaggedCountDisplay.textContent = "--";
  refs.riskLevelDisplay.textContent = "待分析";
  refs.summaryText.textContent = "上传课程文件后，系统将在这里给出总体判断。";
  refs.introOutput.textContent = "生成后将在这里显示。";
  refs.discussionOutput.textContent = "生成后将在这里显示。";
  refs.exerciseOutput.textContent = "生成后将在这里显示。";
  refs.pptOutput.textContent = "生成后将在这里显示。";
  refs.pageReportList.innerHTML = `<div class="empty-state"><p>等待分析结果。建议上传可提取文字的 PDF，以获得更准确的页码定位与自动改写能力。</p></div>`;
  refs.pagePreviewList.innerHTML = `<p class="muted-text">上传文件后，会在这里显示前几页的文字摘要。</p>`;
  renderRewritePreview([]);
  updateRewriteSelectionSummary();
}

function collectMeta() {
  return {
    course: refs.courseName.value.trim() || "未命名课程",
    chapter: refs.chapterName.value.trim() || "未命名章节",
    mode: refs.updateMode.value,
    goal: refs.teachingGoal.value.trim()
  };
}

async function copySummary() {
  const pageTexts = [...document.querySelectorAll(".page-card")]
    .map((card) => card.innerText.replace(/\n+/g, "\n").trim())
    .join("\n\n");

  const text = [
    `文件：${refs.fileNameDisplay.textContent}`,
    `总页数：${refs.pageCountDisplay.textContent}`,
    `需更新页数：${refs.flaggedCountDisplay.textContent}`,
    `风险等级：${refs.riskLevelDisplay.textContent}`,
    `总体判断：${refs.summaryText.textContent}`,
    `按页诊断：\n${pageTexts || "暂无"}`,
    `课堂导入：${refs.introOutput.textContent}`,
    `讨论题：${refs.discussionOutput.textContent}`,
    `练习题：${refs.exerciseOutput.textContent}`,
    `PPT讲稿：${refs.pptOutput.textContent}`
  ].join("\n\n");

  try {
    await navigator.clipboard.writeText(text);
    refs.runState.textContent = "摘要已复制";
  } catch (_) {
    alert("复制失败，请手动复制页面内容。");
  }
}

function getSelectedRewritePages() {
  return [...document.querySelectorAll(".rewrite-checkbox:checked")]
    .map((checkbox) => Number(checkbox.dataset.page))
    .filter(Boolean);
}

function updateRewriteSelectionSummary() {
  const count = getSelectedRewritePages().length;
  refs.rewriteCountDisplay.textContent = `已选择 ${count} 页`;
  refs.exportPdfBtn.disabled = !(count > 0 && canRewriteCurrentFile());
}

function canRewriteCurrentFile() {
  return Boolean(
    uploadedFile &&
      /\.pdf$/i.test(uploadedFile.name) &&
      parsedPages.some((page) => Array.isArray(page.items) && page.items.length > 0)
  );
}

async function handleRewriteExport() {
  if (!lastResult) {
    alert("请先完成智能分析。");
    return;
  }
  if (!canRewriteCurrentFile()) {
    alert("当前文件暂不支持自动改写导出。请上传可提取文字的 PDF。");
    return;
  }

  const selectedPages = getSelectedRewritePages();
  if (!selectedPages.length) {
    alert("请至少勾选 1 页用于自动改写。");
    return;
  }

  try {
    refs.rewriteStatus.textContent = "正在生成改写文本并导出新版 PDF，请稍候...";
    const meta = collectMeta();
    const rewritePlan = await requestRewrite(selectedPages, meta, lastResult.pageIssues || [], parsedPages);
    rewriteDraft = rewritePlan;
    renderRewritePreview(rewritePlan);

    const pdfBytes = await buildRewrittenPdf(uploadedFile, rewritePlan);
    const downloadName = buildDownloadName(uploadedFile.name);
    downloadBlob(pdfBytes, downloadName, "application/pdf");

    refs.rewriteStatus.textContent = `新版 PDF 已生成：${downloadName}`;
    saveRewriteAction(selectedPages, rewritePlan, downloadName);
  } catch (error) {
    console.error(error);
    refs.rewriteStatus.textContent = "生成失败，请检查 PDF 是否为文字层文档。";
    alert(error?.message || "生成新版 PDF 失败。");
  }
}

async function requestRewrite(selectedPages, meta, pageIssues, pages) {
  const selectedSet = new Set(selectedPages);
  const payload = {
    meta,
    selectedPages,
    pageIssues: pageIssues
      .filter((item) => selectedSet.has(item.page))
      .map((item) => ({
        page: item.page,
        priority: item.priority,
        issues: item.issues,
        suggestion: item.suggestion
      })),
    pages: pages
      .filter((page) => selectedSet.has(page.page))
      .map((page) => ({
        page: page.page,
        text: page.text
      }))
  };

  const resp = await fetch("./api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.error || data?.detail || "页面改写失败");
  }

  const rewrites = Array.isArray(data.rewrites) ? data.rewrites : [];
  return rewrites
    .map((item) => ({
      page: Number(item.page),
      rewrittenText: String(item.rewrittenText || "").trim(),
      rationale: String(item.rationale || "").trim()
    }))
    .filter((item) => item.page && item.rewrittenText);
}

async function buildRewrittenPdf(file, rewrites) {
  if (!window.PDFLib) {
    throw new Error("PDF 导出库未加载成功。");
  }

  const { PDFDocument, rgb } = window.PDFLib;
  const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
  const pdfPages = pdfDoc.getPages();

  for (const rewrite of rewrites) {
    const sourcePage = parsedPages.find((page) => page.page === rewrite.page);
    const targetPage = pdfPages[rewrite.page - 1];
    if (!sourcePage || !targetPage || !Array.isArray(sourcePage.items) || !sourcePage.items.length) {
      continue;
    }

    const bounds = computeTextBounds(sourcePage.items, targetPage.getWidth(), targetPage.getHeight());
    const innerWidth = Math.max(120, bounds.width - 12);
    const innerHeight = Math.max(60, bounds.height - 12);
    const textImage = await createRewriteTextImage(rewrite.rewrittenText, innerWidth, innerHeight, sourcePage.items);
    const pngImage = await pdfDoc.embedPng(textImage.dataUrl);

    targetPage.drawRectangle({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      color: rgb(0.985, 0.972, 0.948)
    });

    targetPage.drawImage(pngImage, {
      x: bounds.x + 6,
      y: bounds.y + 6,
      width: innerWidth,
      height: innerHeight
    });
  }

  return await pdfDoc.save();
}

function computeTextBounds(items, pageWidth, pageHeight) {
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;

  items.forEach((item) => {
    const x = Number(item.x || 0);
    const y = Number(item.y || 0);
    const width = Number(item.width || 0);
    const height = Number(item.height || item.fontSize || 12);
    xMin = Math.min(xMin, x);
    yMin = Math.min(yMin, y - height * 0.38);
    xMax = Math.max(xMax, x + Math.max(width, 20));
    yMax = Math.max(yMax, y + height * 0.92);
  });

  const x = clamp(xMin - 6, 18, Math.max(18, pageWidth - 140));
  const y = clamp(yMin - 10, 18, Math.max(18, pageHeight - 120));
  const width = clamp(xMax - xMin + 14, 150, Math.max(150, pageWidth - x - 18));
  const height = clamp(yMax - yMin + 20, 80, Math.max(80, pageHeight - y - 18));

  return { x, y, width, height };
}

function chooseFontSize(text, maxWidth, maxHeight, sourceItems) {
  const ctx = getCanvasMeasureContext();
  const averageSourceSize =
    sourceItems.reduce((sum, item) => sum + (Number(item.fontSize) || 12), 0) / Math.max(1, sourceItems.length);
  const start = clamp(Math.round(averageSourceSize), 10, 18);

  for (let size = start; size >= 8; size -= 1) {
    const lines = wrapText(text, ctx, size, maxWidth);
    const totalHeight = lines.length * size * 1.32;
    if (totalHeight <= maxHeight) return size;
  }

  return 8;
}

function wrapText(text, ctx, fontSize, maxWidth) {
  ctx.font = buildCanvasFont(fontSize);
  const paragraphs = String(text || "").split(/\n+/);
  const lines = [];

  paragraphs.forEach((paragraph, index) => {
    const chars = [...paragraph];
    let current = "";

    chars.forEach((char) => {
      const candidate = current + char;
      const width = ctx.measureText(candidate).width;
      if (width > maxWidth && current) {
        lines.push(current);
        current = char;
      } else {
        current = candidate;
      }
    });

    if (current) lines.push(current);
    if (!current && !paragraph.trim()) lines.push("");
    if (index < paragraphs.length - 1) lines.push("");
  });

  return lines.filter((line, index, arr) => !(line === "" && arr[index - 1] === ""));
}

async function createRewriteTextImage(text, width, height, sourceItems) {
  const canvas = document.createElement("canvas");
  const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("浏览器画布初始化失败，无法导出改写内容。");
  }

  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);

  const fontSize = chooseFontSize(text, width, height, sourceItems);
  const lines = wrapText(text, ctx, fontSize, width);
  const lineHeight = fontSize * 1.32;

  ctx.font = buildCanvasFont(fontSize);
  ctx.fillStyle = "rgb(46, 31, 23)";
  ctx.textBaseline = "top";

  let cursorY = 0;
  lines.forEach((line) => {
    if (cursorY > height - lineHeight) return;
    ctx.fillText(line, 0, cursorY);
    cursorY += lineHeight;
  });

  return {
    dataUrl: canvas.toDataURL("image/png")
  };
}

function getCanvasMeasureContext() {
  const canvas = document.createElement("canvas");
  return canvas.getContext("2d");
}

function buildCanvasFont(fontSize) {
  return `${fontSize}px "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif`;
}

function renderRewritePreview(rewrites) {
  refs.rewritePreviewList.innerHTML = rewrites.length
    ? rewrites
        .map(
          (item) => `
            <article class="rewrite-preview-card">
              <h4>第 ${item.page} 页改写预览</h4>
              <p><strong>改写说明：</strong>${escapeHtml(item.rationale || "已根据分析结果重写本页文字。")}</p>
              <p><strong>即将写入：</strong>${escapeHtml(shorten(item.rewrittenText, 420)).replace(/\n/g, "<br>")}</p>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state compact"><p>完成分析后，这里会展示即将写入新 PDF 的页面与改写说明。</p></div>`;
}

function loadHistoryRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function persistHistoryRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(historyRecords));
}

function saveHistoryRecord(fileName, meta, pages, result) {
  const record = {
    id: createId(),
    createdAt: Date.now(),
    fileName,
    meta,
    pagesCount: pages.length,
    result: {
      summary: result.summary,
      riskLevel: result.riskLevel,
      flaggedPages: result.flaggedPages || [],
      pageIssues: (result.pageIssues || []).map((item) => ({
        page: item.page,
        priority: item.priority,
        issues: item.issues,
        suggestion: item.suggestion
      })),
      pack: result.pack
    },
    rewrites: []
  };

  historyRecords = [record, ...historyRecords].slice(0, 30);
  activeHistoryId = record.id;
  persistHistoryRecords();
  renderHistory();
}

function saveRewriteAction(selectedPages, rewrites, downloadName) {
  const record = historyRecords.find((item) => item.id === activeHistoryId) || historyRecords[0];
  if (!record) return;

  record.rewrites = [
    {
      id: createId(),
      createdAt: Date.now(),
      pages: selectedPages,
      downloadName,
      previews: rewrites.map((item) => ({
        page: item.page,
        rationale: item.rationale,
        preview: shorten(item.rewrittenText, 160)
      }))
    },
    ...(record.rewrites || [])
  ];

  persistHistoryRecords();
  renderHistory();
}

function renderHistory() {
  refs.historyCount.textContent = `${historyRecords.length} 条`;

  if (!historyRecords.length) {
    refs.historyList.innerHTML = `<div class="empty-state compact"><p>还没有本机记录。完成一次分析后，这里会自动出现历史数据。</p></div>`;
    refs.historyDetail.innerHTML = `<div class="empty-state compact"><p>这里会显示你之前分析过的文件、重点改动页、导出记录和改写说明。</p></div>`;
    return;
  }

  if (!historyRecords.some((item) => item.id === activeHistoryId)) {
    activeHistoryId = historyRecords[0].id;
  }

  refs.historyList.innerHTML = historyRecords
    .map(
      (record) => `
        <article class="history-item ${record.id === activeHistoryId ? "active" : ""}" data-history-id="${record.id}">
          <h4>${escapeHtml(record.fileName)}</h4>
          <p>${escapeHtml(record.meta.course)} / ${escapeHtml(record.meta.chapter)}</p>
          <small>${formatTime(record.createdAt)} · ${escapeHtml(record.result.riskLevel)}风险 · ${record.result.flaggedPages.length} 页待更新</small>
        </article>
      `
    )
    .join("");

  refs.historyList.querySelectorAll("[data-history-id]").forEach((item) => {
    item.addEventListener("click", () => {
      activeHistoryId = item.dataset.historyId;
      renderHistory();
    });
  });

  renderHistoryDetail(historyRecords.find((item) => item.id === activeHistoryId));
}

function renderHistoryDetail(record) {
  if (!record) {
    refs.historyDetail.innerHTML = `<div class="empty-state compact"><p>请选择一条记录查看详情。</p></div>`;
    return;
  }

  const pageIssueList = (record.result.pageIssues || []).length
    ? `
        <ul class="history-listing">
          ${record.result.pageIssues
            .map(
              (item) =>
                `<li><strong>第 ${item.page} 页</strong>：${escapeHtml((item.issues || []).join("、") || "待补充")}。${escapeHtml(shorten(item.suggestion || "", 140))}</li>`
            )
            .join("")}
        </ul>
      `
    : `<p>这次分析没有标出必须立即更新的页面。</p>`;

  const rewriteList = (record.rewrites || []).length
    ? `
        ${record.rewrites
          .map(
            (rewrite) => `
              <div class="history-block">
                <p><strong>导出时间：</strong>${formatTime(rewrite.createdAt)}</p>
                <p><strong>导出文件：</strong>${escapeHtml(rewrite.downloadName)}</p>
                <p><strong>处理页面：</strong>${rewrite.pages.map((page) => `第${page}页`).join("、")}</p>
                <ul class="history-listing">
                  ${rewrite.previews
                    .map(
                      (item) =>
                        `<li><strong>第 ${item.page} 页</strong>：${escapeHtml(item.rationale || "已完成改写")}。${escapeHtml(item.preview || "")}</li>`
                    )
                    .join("")}
                </ul>
              </div>
            `
          )
          .join("")}
      `
    : `<p>这条记录还没有导出新版 PDF。</p>`;

  refs.historyDetail.innerHTML = `
    <div class="history-block">
      <p><strong>文件：</strong>${escapeHtml(record.fileName)}</p>
      <p><strong>课程：</strong>${escapeHtml(record.meta.course)} / ${escapeHtml(record.meta.chapter)}</p>
      <p><strong>分析时间：</strong>${formatTime(record.createdAt)}</p>
      <p><strong>总体判断：</strong>${escapeHtml(record.result.summary)}</p>
    </div>
    <div class="history-block">
      <p><strong>重点改动页：</strong></p>
      ${pageIssueList}
    </div>
    <div class="history-block">
      <p><strong>导出记录：</strong></p>
      ${rewriteList}
    </div>
  `;
}

function clearHistoryRecords() {
  if (!historyRecords.length) return;
  const confirmed = window.confirm("确定清空本机保存的分析历史和导出记录吗？");
  if (!confirmed) return;

  historyRecords = [];
  activeHistoryId = null;
  persistHistoryRecords();
  renderHistory();
}

function setupRevealObserver() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
        }
      });
    },
    { threshold: 0.12 }
  );

  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

function setupBookInteractions() {
  if (!refs.bookShowcase) return;
  refs.bookShowcase.addEventListener("mouseenter", () => refs.bookShowcase.classList.add("is-active"));
  refs.bookShowcase.addEventListener("mouseleave", () => refs.bookShowcase.classList.remove("is-active"));
}

function downloadBlob(data, name, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildDownloadName(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${base}_智能改写版.pdf`;
}

function createId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toDisplayBlock(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }
  return String(value || "");
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shorten(text, length) {
  if (!text) return "未提取到有效文本。";
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

})();

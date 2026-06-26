# 课程更新雷达智能体 · 大模型增强版（v3）

这一版不是展示站，而是更接近产品原型的网页应用雏形。

## 当前能力（升级点）

- 上传课程文件并读取内容
- 支持 `.pdf` 与 `.txt`
- 优先针对 `PDF` 做按页分析
- 输出“第几页需要更新、为什么要更新、建议怎么改”
- 生成课堂导入、讨论题、练习题与 PPT 讲稿草案
- **可选：调用真实大模型 API 做深度诊断（更像可推广产品）**

## 为什么推荐 PDF

你提出的核心需求是：**不要只做总结，而要具体到哪一页哪一页需要更新。**

这个需求最适合通过 `PDF` 来实现，因为：

- PDF 天然有页码
- 前端可以直接逐页提取文字
- 更适合部署为纯静态网页，不依赖后端

## 本地预览

```powershell
python -m http.server 8081
```

打开：

`http://127.0.0.1:8081`

## 公网部署

这套网页是纯静态版本，可以直接部署到：

- Netlify
- Vercel
- GitHub Pages

最省事的方式是：

1. 把整个 `course-update-radar-web-v2` 文件夹压缩
2. 拖到 Netlify Drop
3. 自动得到一个公网网址

## 为什么要加后端（很重要）

如果你想“真正调用大模型 API”，**API Key 不能写在前端网页里**，否则任何访问者都能拿走你的 Key 并消耗额度。
因此必须用一个极轻量的后端（Serverless Function）来代理请求：前端把按页文本发给后端，后端带着 Key 调用大模型，然后把结果返回给网页。

本目录已提供 Vercel Serverless Function：`api/analyze.js`。

## 部署到 Vercel（推荐）

1. 把整个 `course-update-radar-web-v3-llm` 上传到 GitHub 仓库（Vercel 更适合这种带后端函数的项目）
2. Vercel 创建新项目并导入该仓库
3. 在 Vercel 的 Project Settings → Environment Variables 添加：
   - `OPENAI_API_KEY`：你的大模型 Key
   - `OPENAI_BASE_URL`：可选，默认为 `https://api.openai.com/v1`（如果你用兼容 OpenAI 的服务，把它改成对应地址）
   - `OPENAI_MODEL`：可选，默认 `gpt-4o-mini`
4. Deploy 完成后，打开公网网址即可

## 前端回退机制

如果你没有配置后端环境变量或后端不可用，前端会自动回退到“原型规则分析”，保证演示不崩。

## 当前限制

- 这是原型版，不是真正接入大模型 API 的生产系统
- 当前“AI 分析”采用前端规则模拟与结构化生成逻辑
- 如果后面要变成真正的 AI 分析平台，可以继续接入大模型 API 和后端文件解析服务

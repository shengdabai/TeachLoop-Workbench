const STORAGE_KEY = "teachloop.workspace.v1";

const form = document.querySelector("#missionForm");
const topicInput = document.querySelector("#topic");
const outcomeInput = document.querySelector("#outcome");
const levelInput = document.querySelector("#level");
const timeboxInput = document.querySelector("#timebox");
const materialsInput = document.querySelector("#materials");
const loopBoard = document.querySelector("#loopBoard");
const statusStrip = document.querySelector("#statusStrip");
const quizArea = document.querySelector("#quizArea");
const planTable = document.querySelector("#planTable");
const reviewChecklist = document.querySelector("#reviewChecklist");
const exportDialog = document.querySelector("#exportDialog");
const exportOutput = document.querySelector("#exportOutput");

const defaultState = {
  topic: topicInput.value,
  outcome: outcomeInput.value,
  level: levelInput.value,
  timebox: timeboxInput.value,
  materials: "",
  snapshots: [],
  completed: {},
  lastGeneratedAt: new Date().toISOString()
};

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...defaultState };
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function levelLabel(level) {
  return {
    beginner: "建立框架",
    operator: "系统化操作",
    builder: "产品化搭建",
    expert: "方法提炼"
  }[level] || "系统化操作";
}

function deriveKeywords(text) {
  const cleaned = text
    .replace(/[，。；：！？、,.!?:;()\[\]{}"'“”‘’]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  return [...new Set(cleaned)].slice(0, 6);
}

function buildLoop(data) {
  const keywords = deriveKeywords(`${data.topic} ${data.outcome} ${data.materials}`);
  const time = Number(data.timebox);
  const sourceTask = data.materials.trim()
    ? "先从你粘贴的材料中提取 5 个可验证观点，给每个观点标来源。"
    : "先补 3 个高信任来源：官方文档、经典书/论文、真实案例或高质量社区。";

  return {
    metrics: [
      { value: `${time}m`, label: "今天时间盒" },
      { value: levelLabel(data.level), label: "当前学习区间" },
      { value: keywords.length || 1, label: "待压缩关键词" },
      { value: data.snapshots.length, label: "已保存快照" }
    ],
    cards: [
      {
        kind: "source",
        title: "1. 知识采集",
        points: [
          sourceTask,
          "只记录与你的真实用途直接相关的材料。",
          "每条材料写一句：什么时候该用它。"
        ]
      },
      {
        kind: "practice",
        title: "2. 技能练习",
        points: [
          `用 ${time} 分钟完成一个小产物，不追求百科全覆盖。`,
          "先闭卷说出关键步骤，再打开材料校正。",
          "把错误写成下一轮练习题。"
        ]
      },
      {
        kind: "output",
        title: "3. 真实输出",
        points: [
          `把 ${data.topic} 讲给一个潜在使用者听。`,
          "产出一份清单、脚本、演示页或客户话术。",
          "用结果反推下一课，而不是按目录推进。"
        ]
      }
    ]
  };
}

function buildQuiz(data) {
  const topic = data.topic || "当前主题";
  return [
    {
      prompt: `不用看材料，用 3 句话说明：学习「${topic}」最终要服务哪个真实结果？`,
      target: "必须出现真实使用场景、可观察结果、下一步动作。"
    },
    {
      prompt: "列出 3 个你最容易产生幻觉式掌握感的点，并说明如何验证。",
      target: "好答案会把「我懂了」改成可检查的输出、测验或演示。"
    },
    {
      prompt: "把今天要学的内容压缩成一个 15 分钟练习。练习结束时必须留下什么证据？",
      target: "证据可以是文件、截图、回答、命令输出、复盘记录或可演示流程。"
    }
  ];
}

function buildPlan(data) {
  const topic = data.topic || "当前主题";
  return [
    ["D1", "建立 Mission", `写清为什么学 ${topic}，以及不学什么。`, "MISSION.md 更新"],
    ["D2", "采集资源", "找 3 个高信任来源，剔除泛泛教程。", "RESOURCES.md 更新"],
    ["D3", "第一课", "做一个只教一个技能点的 15 分钟 lesson。", "lessons/0001-*.html"],
    ["D4", "闭卷回忆", "不看材料复述流程，再核对错漏。", "3 条错漏记录"],
    ["D5", "真实任务", "把技能用于一个业务、作品或客户场景。", "可展示产物"],
    ["D6", "交叉练习", "把相关概念混合出题，测试迁移能力。", "测验得分或反馈"],
    ["D7", "压缩沉淀", "把能复用的术语、步骤、模板压缩成参考页。", "reference/*.html"]
  ];
}

function buildReview(data) {
  const hasMission = data.outcome.trim().length > 20;
  const hasSource = data.materials.trim().length > 30;
  const hasTopic = data.topic.trim().length >= 2;
  return [
    {
      ok: hasTopic,
      title: "主题足够明确",
      text: hasTopic ? "可以生成具体任务。" : "主题太空，先写一个具体对象。"
    },
    {
      ok: hasMission,
      title: "真实用途可检查",
      text: hasMission ? "学习目标已连接到真实交付。" : "需要补上使用场景和验收结果。"
    },
    {
      ok: hasSource,
      title: "材料来源可追踪",
      text: hasSource ? "可以进入证据化学习。" : "还缺材料，下一步应补高信任来源。"
    },
    {
      ok: Number(data.timebox) <= 60,
      title: "单轮学习不超载",
      text: Number(data.timebox) <= 60 ? "时间盒适合快速闭环。" : "建议拆成两个 60 分钟以内的循环。"
    }
  ];
}

function render() {
  topicInput.value = state.topic;
  outcomeInput.value = state.outcome;
  levelInput.value = state.level;
  timeboxInput.value = state.timebox;
  materialsInput.value = state.materials;

  const loop = buildLoop(state);
  statusStrip.innerHTML = loop.metrics
    .map((metric) => `<div class="metric"><b>${escapeHtml(metric.value)}</b><span>${escapeHtml(metric.label)}</span></div>`)
    .join("");

  loopBoard.innerHTML = loop.cards
    .map((card) => `
      <article class="loop-card" data-kind="${card.kind}">
        <h3>${escapeHtml(card.title)}</h3>
        <ul>${card.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
      </article>
    `)
    .join("");

  quizArea.innerHTML = buildQuiz(state)
    .map((item, index) => `
      <article class="quiz-card">
        <h3>Q${index + 1}</h3>
        <p>${escapeHtml(item.prompt)}</p>
        <textarea class="answer-input" data-quiz="${index}" rows="3" placeholder="先闭卷作答，再点检查。">${escapeHtml(state.completed[`quiz-${index}`] || "")}</textarea>
        <button class="button secondary check-answer" type="button" data-check="${index}">检查</button>
        <div class="feedback" id="feedback-${index}">${escapeHtml(item.target)}</div>
      </article>
    `)
    .join("");

  planTable.innerHTML = `
    <table>
      <thead><tr><th>天</th><th>重点</th><th>任务</th><th>证据</th></tr></thead>
      <tbody>
        ${buildPlan(state)
          .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>
  `;

  reviewChecklist.innerHTML = buildReview(state)
    .map((item) => `
      <div class="check-item">
        <strong aria-hidden="true">${item.ok ? "✓" : "!"}</strong>
        <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>
      </div>
    `)
    .join("");
}

function syncFromForm() {
  state = {
    ...state,
    topic: topicInput.value.trim(),
    outcome: outcomeInput.value.trim(),
    level: levelInput.value,
    timebox: timeboxInput.value,
    materials: materialsInput.value.trim(),
    lastGeneratedAt: new Date().toISOString()
  };
  saveState();
}

function exportMarkdown() {
  const quiz = buildQuiz(state)
    .map((item, index) => `### Q${index + 1}\n\n${item.prompt}\n\nAnswer:\n${state.completed[`quiz-${index}`] || "-"}\n`)
    .join("\n");
  const plan = buildPlan(state)
    .map((row) => `- ${row[0]} ${row[1]}: ${row[2]} Evidence: ${row[3]}`)
    .join("\n");
  return `# TeachLoop Snapshot: ${state.topic}

Generated: ${new Date(state.lastGeneratedAt).toLocaleString("zh-CN")}

## Mission

${state.outcome}

## Constraints

- Current level: ${levelLabel(state.level)}
- Timebox: ${state.timebox} minutes

## Materials

${state.materials || "- Add trusted resources before producing lessons."}

## Retrieval Practice

${quiz}
## 7-Day Plan

${plan}

## Product Review

${buildReview(state).map((item) => `- ${item.ok ? "PASS" : "FIX"}: ${item.title} - ${item.text}`).join("\n")}
`;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  syncFromForm();
  render();
});

document.querySelector("#saveSnapshot").addEventListener("click", () => {
  syncFromForm();
  state.snapshots = [
    {
      at: new Date().toISOString(),
      topic: state.topic,
      outcome: state.outcome,
      level: state.level,
      timebox: state.timebox
    },
    ...state.snapshots
  ].slice(0, 12);
  saveState();
  render();
});

quizArea.addEventListener("input", (event) => {
  if (!event.target.matches(".answer-input")) return;
  state.completed[`quiz-${event.target.dataset.quiz}`] = event.target.value;
  saveState();
});

quizArea.addEventListener("click", (event) => {
  if (!event.target.matches(".check-answer")) return;
  const index = event.target.dataset.check;
  const answer = state.completed[`quiz-${index}`] || "";
  const feedback = document.querySelector(`#feedback-${index}`);
  feedback.textContent = answer.trim().length >= 40
    ? "可用。下一步把答案压缩成一句操作准则，并写入学习记录。"
    : "太短。补上场景、判断标准和可验证证据。";
});

document.querySelector("#exportMarkdown").addEventListener("click", () => {
  syncFromForm();
  exportOutput.value = exportMarkdown();
  exportDialog.showModal();
});

document.querySelector("#copyExport").addEventListener("click", async () => {
  await navigator.clipboard.writeText(exportOutput.value);
});

document.querySelector("#resetWorkspace").addEventListener("click", () => {
  if (!confirm("清空这个浏览器里的 TeachLoop 本地状态？文件不会被删除。")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = { ...defaultState };
  render();
});

render();

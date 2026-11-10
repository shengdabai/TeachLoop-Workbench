# TeachLoop 学习工作台

本目录是基于 `teach` skill 的本地学习产品。它把任意主题转成一个可执行学习循环：使命、材料、即时回忆、7 天巩固路线、质量检查和导出记录。

## 运行

直接双击 `index.html` 可以打开。需要本地服务时运行：

```bash
cd TeachLoop-Workbench
python3 -m http.server 8127 --bind 127.0.0.1
```

然后打开 `http://127.0.0.1:8127/`。

## 工作区结构

```text
12-TeachLoop学习工作台/
├── index.html
├── styles.css
├── app.js
├── MISSION.md
├── RESOURCES.md
├── NOTES.md
├── lessons/
├── reference/
├── learning-records/
└── reviews/
```

## 验收

- `node --check app.js`
- 本地服务打开首页
- 桌面和移动视口检查无文本溢出
- 导出记录弹窗可用

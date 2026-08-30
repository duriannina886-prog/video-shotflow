# Shotflow · 短视频 AI 分镜与资产管理

流程：**脚本（生成/上传）→ 素材建议 → 分类资源库 → 分镜提示词与自动配图 → 插件发送**；对生成视频不满意可回到分镜优化提示词。

## 技术栈

Next.js 16 · React 19 · Prisma · SQLite · Tailwind · Zod · Zustand

## 启动

```bash
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

打开 http://localhost:3002（`npm run dev` 已固定该端口）。

可选：`.env` 中配置 `LLM_API_KEY`；未配置时走 mock，便于先跑通链路。

## 工作流步骤

1. **脚本**：项目标题 + 业务诉求；「生成脚本」或「上传现有脚本」
2. **素材建议**：根据脚本提出人物/道具/场景/其他参考图清单
3. **资源库**：按四分类上传图片，分类间可拖拽改类
4. **分镜提示词**：切分生视频 Prompt；本镜参考图最多 10 张，顺序即图一…图十；生成时写入图注，调序后可规则刷新标注。「一键发送」带 `data-prompt` / `data-images`
5. **反馈优化**：对第三方生成结果不满意时，在分镜卡片内优化提示词（会按当前图序重标）

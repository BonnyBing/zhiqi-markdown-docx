# 部署说明

本文只提供步骤，不执行真实部署，也不写入真实密钥。

## 1. 创建 GitHub 仓库

1. 在 GitHub 新建空仓库，例如 `zhiqi-markdown-docx`（不要自动添加 README，以免与本地文件冲突）。
2. 在本项目目录初始化并推送：

```bash
cd zhiqi-markdown-docx
git init
git add .
git commit -m "Initial Markdown to Word service for Zhiqi."
git branch -M main
git remote add origin git@github.com:BonnyBing/zhiqi-markdown-docx.git
git push -u origin main
```

GitHub 只保存源代码。不要提交 `.env`、真实 API 密钥或 Blob Token。

仓库地址：https://github.com/BonnyBing/zhiqi-markdown-docx

## 2. 连接 Vercel 项目

1. 打开 [Vercel Dashboard](https://vercel.com/dashboard) → Add New → Project。
2. Import 上一步的 GitHub 仓库。
3. Framework Preset 选 Other。
4. Root Directory 保持仓库根目录（含 `api/`、`vercel.json`、`package.json`）。
5. Node.js 版本选择 20.x 或更高。
6. 先不要 Deploy，先完成 Blob 与环境变量。

## 3. 创建 Vercel Blob Store

1. 在 Vercel 项目中打开 Storage → Create Database → Blob。
2. 创建 **public** store（老师和智启需要通过链接直接下载）。
3. 把该 store 连接到本项目。
4. Vercel 会提供 `BLOB_READ_WRITE_TOKEN`。复制后只放到项目环境变量，不要提交到 Git。

## 4. public Blob 的隐私含义

- 上传时使用 `access: "public"`。
- 得到 `word_url` 的任何人都可以下载，无需登录。
- 链接不可猜测（路径含 UUID），但这不是访问控制。
- **不要**用本服务保存含学生姓名、学号、成绩、家庭信息的文档。

## 5. 配置环境变量

在 Vercel Project → Settings → Environment Variables 中添加：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `DOCX_API_KEY` | 是 | 智启插件调用转换接口时使用的密钥，自行生成长随机串 |
| `BLOB_READ_WRITE_TOKEN` | 是 | Blob store 的读写令牌 |
| `MAX_MARKDOWN_BYTES` | 否 | 默认 `122880`（120KB） |
| `ALLOWED_IMAGE_HOSTS` | 建议 | 逗号分隔，例如 `rdfx-grade3-kg-deploy.vercel.app,bonnybing.github.io`。配置后只允许这些域名 |
| `FILE_RETENTION_HOURS` | 否 | 默认 `72` |
| `PUBLIC_BASE_URL` | 否 | 部署后的站点根 URL，例如 `https://your-project.vercel.app` |
| `CRON_SECRET` | 清理需要 | 手动或 Cron 调用 `/api/cleanup-docx` 时使用。Vercel Cron 会自动带 `Authorization: Bearer <CRON_SECRET>` |
| `CLEANUP_ENABLED` | 否 | 只有确认 Cron 确实在跑时才设为 `true`。否则成功响应的 `expires_at` 必须为空 |
| `ALLOWED_ORIGINS` | 否 | 浏览器 CORS 白名单。留空表示允许任意来源，供智启插件「试运行」跨域调用 |

生产、预览环境都要配置。不要把真实值写进 `openapi` 或网页。

## 6. 部署

环境变量保存后，点击 Deploy，或推送 `main` 触发自动部署。

部署完成后记下生产域名，例如：

```text
https://zhiqi-markdown-docx.vercel.app
```

## 7. 验证 health

```bash
curl -sS https://YOUR_PROJECT.vercel.app/api/health
```

期望：

```json
{
  "status": "ok",
  "service": "zhiqi-markdown-docx",
  "storage_configured": true,
  "version": "1.0.0"
}
```

`storage_configured` 为 `false` 表示尚未配置 `BLOB_READ_WRITE_TOKEN`。响应中不应出现任何密钥。

也可打开站点根路径，查看说明页上的健康检查状态。

## 8. 测试 generate-docx

```bash
curl -sS -X POST https://YOUR_PROJECT.vercel.app/api/generate-docx \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_DOCX_API_KEY" \
  -d '{
    "markdown": "# 测试教案\n\n这是一段中文。\n\n| 环节 | 时间 |\n| --- | --- |\n| 导入 | 5分钟 |\n",
    "filename": "测试教案",
    "document_title": "测试标题"
  }'
```

成功时 `word_status` 为 `success`，`word_url` 以 `https://` 开头，浏览器打开应能下载 `.docx`。

失败校验：

- 不带 `x-api-key` → 401，`word_url` 为空
- `"markdown": "   "` → 400，`word_url` 为空

## 9. 更新 OpenAPI 中的 server 地址

编辑 `openapi/zhiqi-markdown-docx-plugin.yaml`：

```yaml
servers:
  - url: https://YOUR_PROJECT.vercel.app
```

把占位域名换成第 6 步的真实地址后提交。智启只会调用这里的 server + `/api/generate-docx`。

## 10. 把 OpenAPI YAML 导入智启

1. 打开智启智能体中心 → 插件 / 工具。
2. 选择导入 OpenAPI 3.0。
3. 上传或粘贴 `openapi/zhiqi-markdown-docx-plugin.yaml`。
4. 确认 `operationId` 为 `generateTeachingDocx`。
5. 只暴露三个参数：`markdown`、`filename`、`document_title`。

## 11. 在智启中配置 x-api-key

1. 认证类型选择 API Key。
2. Key 管理选择「均使用我的 Key」。
3. Auth Type 优先选 **Custom**；若出现请求头名称，填写 `x-api-key`。没有该输入框时选 **Bearer**。`Basic` 也可以，但不要截断密钥。
4. API key 必须与 Vercel `DOCX_API_KEY` 完全一致（64 位十六进制，不要少末尾几位）。
5. 不要把密钥写进工作流提示词或网页。
6. 服务端同时接受 `x-api-key`、`Authorization: Bearer` 和 `Authorization: Basic`。

数据提取建议读取顶层字段：`code`、`word_status`、`word_url`、`word_filename`、`word_size_bytes`、`word_message`、`warnings_text`、`expires_at`。

分支规则：仅当 `code = 200` 且 `word_status = success` 且 `word_url` 非空时视为成功。

## 12. 配置定时清理

`vercel.json` 已包含：

```json
{
  "crons": [{ "path": "/api/cleanup-docx", "schedule": "0 4 * * *" }]
}
```

这是每天 UTC 04:00 的 GET 请求。

| 套餐 | 实际效果 |
| --- | --- |
| Pro / Enterprise | Cron 会调用接口。请同时配置 `CRON_SECRET`，确认日志有成功记录后再设 `CLEANUP_ENABLED=true` |
| Hobby | **不会运行 Cron**。配置写在文件里不等于已经生效 |

Hobby 或开发环境请使用下一节的人工清理，且保持 `CLEANUP_ENABLED` 未设置或为 `false`，这样接口不会返回虚假的 `expires_at`。

## 13. 查看和人工删除 Blob 文件

1. Vercel Dashboard → Storage → 对应 Blob store → Browse。
2. 前缀为 `docx/`。
3. 可在控制台单条删除。

手动调用清理接口（会删除超过 `FILE_RETENTION_HOURS` 的对象）：

```bash
curl -sS -X GET https://YOUR_PROJECT.vercel.app/api/cleanup-docx \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

或：

```bash
curl -sS -X POST https://YOUR_PROJECT.vercel.app/api/cleanup-docx \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

## 14. 回滚部署

1. Vercel 项目 → Deployments。
2. 找到上一个成功的生产部署 → ⋮ → Instant Rollback / Promote to Production。
3. 回滚不会自动删除已经生成的 Blob 文件；如需删除请到 Blob 控制台或调用清理接口。
4. 若环境变量配错，先改变量再 Redeploy，不要只回滚代码。

## 本地联调（可选）

```bash
npx vercel login
npx vercel link
npx vercel env pull .env
npx vercel dev
```

`vercel env pull` 会写入真实密钥，确保 `.env` 已被 `.gitignore` 排除。

# 智启 Markdown 转 Word

把已确认的 Markdown 教案转换成 **Word 原生 DOCX**，供[智启](https://www.zhiqi.com)插件调用。

- GitHub 只保存源代码：https://github.com/BonnyBing/zhiqi-markdown-docx
- Vercel 运行 API。
- Vercel Blob 保存生成的 DOCX，并返回真实 HTTPS 下载链接。

本工具 **不生成、不改写教案内容**。转换或上传失败时 `word_url` 必须为空，禁止虚构下载链接。

## 能做什么

- 解析 Markdown token（不是先转 HTML 再塞进 Word）
- 生成真实的 Heading 1–6、编号列表、项目符号、原生表格、页码
- 下载 HTTPS 公网图片并嵌入 `word/media`
- 中文宋体 / 黑体，A4 页边距 2.54cm
- 扁平 JSON 返回，方便智启数据提取节点读取

## 不做什么

- 不调用 MD2Doc
- 不依赖本机 Microsoft Word 或 Pandoc
- 不把 HTML 字符串直接写入 DOCX
- 不把 Markdown 表格当成管道文本
- 不在 Word 里只留下图片网址
- 不把 Vercel 临时目录路径当成下载地址

## 本地开发

```bash
cd zhiqi-markdown-docx
npm install
cp .env.example .env
# 本地测转换逻辑可以先不填真实 Blob Token；/api/generate-docx 上传会失败
npm test
npm run typecheck
npm run sample
```

本地生成的验收文件：

```text
tests/output/lesson-plan.docx
tests/fixtures/graph.png
```

用 `vercel dev` 启动接口前，需要在 `.env` 中填写 `DOCX_API_KEY`。没有 `BLOB_READ_WRITE_TOKEN` 时，转换会在上传阶段失败并返回空 `word_url`，这是预期行为。

## 接口

### `GET /api/health`

```json
{
  "status": "ok",
  "service": "zhiqi-markdown-docx",
  "storage_configured": true,
  "version": "1.0.0"
}
```

### `POST /api/generate-docx`

请求头：`Content-Type: application/json`，`x-api-key: <DOCX_API_KEY>`。

```json
{
  "markdown": "# 小学三年级数学跨学科教案\n\n完整教案内容……",
  "filename": "小学三年级数学-乘除法的应用（二）-科学跨学科教案",
  "document_title": "乘除法的应用（二）——溶解速度公平实验"
}
```

成功：

```json
{
  "code": 200,
  "word_status": "success",
  "word_url": "https://……/xxx.docx",
  "word_filename": "小学三年级数学-乘除法的应用（二）-科学跨学科教案.docx",
  "word_size_bytes": 123456,
  "word_message": "",
  "warnings_text": "",
  "expires_at": ""
}
```

失败（任意非 200）：

```json
{
  "code": 400,
  "word_status": "error",
  "word_url": "",
  "word_filename": "",
  "word_size_bytes": 0,
  "word_message": "明确的失败原因",
  "warnings_text": "",
  "expires_at": ""
}
```

`expires_at` 仅在确认 Vercel Cron 已实际启用并设置 `CLEANUP_ENABLED=true` 后才会填写。Hobby 套餐没有 Cron 时必须保持空字符串。

## 智启插件

OpenAPI 文件：

```text
openapi/zhiqi-markdown-docx-plugin.yaml
```

部署后把 `servers.url` 换成真实 Vercel 域名，再导入智启。插件鉴权请求头为 `x-api-key`。

## 隐私

Blob 访问模式是 **public**。任何人拿到 `word_url` 都可以下载。不要用这个服务存放含学生姓名、成绩或其他敏感信息的文档。

## 定时清理

`vercel.json` 中配置了每天 UTC 04:00 调用 `/api/cleanup-docx`。

- **Vercel Pro / Enterprise**：Cron 会实际运行。配置 `CRON_SECRET` 后，把 `CLEANUP_ENABLED` 设为 `true`，成功响应才会带 `expires_at`。
- **Hobby / 本地**：Cron **不会**执行。请按 [docs/deployment.md](docs/deployment.md) 用 curl 手动清理，不要把未启用的清理写成已经生效。

## 部署

完整步骤见 [docs/deployment.md](docs/deployment.md)。源码仓库：https://github.com/BonnyBing/zhiqi-markdown-docx 。Vercel 环境变量和 Blob 仍需在控制台配置后再部署。

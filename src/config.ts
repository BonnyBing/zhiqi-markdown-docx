/**
 * 运行时配置。
 *
 * 所有配置都在每次请求时从 process.env 读取（而不是在模块加载时快照），
 * 这样单元测试可以逐个用例覆盖环境变量，Vercel 也能在不重新构建的情况下改配置。
 */

export const SERVICE_NAME = 'zhiqi-markdown-docx';
export const SERVICE_VERSION = '1.0.0';

/** Markdown 默认最大字节数：120KB。 */
export const DEFAULT_MAX_MARKDOWN_BYTES = 122880;
/** 文件名最大字符数（不含 .docx 扩展名）。 */
export const MAX_FILENAME_CHARS = 80;
/** 整个 JSON 请求体的最大字节数，留出 filename / document_title / JSON 转义的余量。 */
export const REQUEST_BODY_SLACK_BYTES = 32768;

/** 单张图片最大字节数：8MB。 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** 单篇文档最多嵌入的远程图片数量。 */
export const MAX_REMOTE_IMAGES = 10;
/** 单张图片下载超时（毫秒）。 */
export const IMAGE_TIMEOUT_MS = 10000;
/** 图片下载允许的最大重定向次数。 */
export const MAX_IMAGE_REDIRECTS = 3;

/** 旧版 Blob 路径前缀；新文件不再使用，清理时仍会扫到这些对象。 */
export const BLOB_PREFIX = 'docx';
/** DOCX 的 MIME 类型。 */
export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
};

const parseCsv = (raw: string | undefined): string[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
};

/** 存储后端：本机目录（Docker/自建）或 Vercel Blob。 */
export type StorageBackend = 'local' | 'vercel_blob' | 'none';

export type RuntimeConfig = {
  /** 转换接口要求的 API 密钥；未配置时接口拒绝所有请求。 */
  readonly apiKey: string;
  /** Vercel Blob 读写令牌是否已配置。 */
  readonly hasBlobToken: boolean;
  readonly blobToken: string;
  /**
   * 本机落盘目录（Docker volume）。设置后优先于 Vercel Blob。
   * 例如 /data/word-files
   */
  readonly localStorageDir: string;
  readonly hasLocalStorage: boolean;
  /** 实际选用的存储后端。 */
  readonly storageBackend: StorageBackend;
  readonly maxMarkdownBytes: number;
  /**
   * 历史环境变量 ALLOWED_IMAGE_HOSTS 的解析结果。
   * 已不再用于拒绝图片，任意公网 HTTPS 地址都会尝试嵌入。
   */
  readonly allowedImageHosts: readonly string[];
  /**
   * 公司内网可信任的图片主机（主机名或 IP，不含端口）。
   * 对这些主机允许 http/https，并放行私网地址（供嵌入同机知识图谱图）。
   * 例：TRUSTED_IMAGE_HOSTS=10.20.0.34
   */
  readonly trustedImageHosts: readonly string[];
  readonly fileRetentionHours: number;
  readonly publicBaseUrl: string;
  readonly cronSecret: string;
  /** 定时清理是否真正启用；未启用时不返回 expires_at。 */
  readonly cleanupEnabled: boolean;
  readonly allowedOrigins: readonly string[];
};

const resolveStorageBackend = (
  hasLocal: boolean,
  hasBlob: boolean,
): StorageBackend => {
  if (hasLocal) return 'local';
  if (hasBlob) return 'vercel_blob';
  return 'none';
};

export const getConfig = (env: NodeJS.ProcessEnv = process.env): RuntimeConfig => {
  const localStorageDir = (env.LOCAL_STORAGE_DIR ?? '').trim();
  const hasLocalStorage = localStorageDir.length > 0;
  const blobToken = (env.BLOB_READ_WRITE_TOKEN ?? '').trim();
  const hasBlobToken = blobToken.length > 0;
  return {
    apiKey: (env.DOCX_API_KEY ?? '').trim(),
    hasBlobToken,
    blobToken,
    localStorageDir,
    hasLocalStorage,
    storageBackend: resolveStorageBackend(hasLocalStorage, hasBlobToken),
    maxMarkdownBytes: parsePositiveInt(env.MAX_MARKDOWN_BYTES, DEFAULT_MAX_MARKDOWN_BYTES),
    allowedImageHosts: parseCsv(env.ALLOWED_IMAGE_HOSTS),
    trustedImageHosts: parseCsv(env.TRUSTED_IMAGE_HOSTS),
    fileRetentionHours: parsePositiveInt(env.FILE_RETENTION_HOURS, 72),
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? '').trim(),
    cronSecret: (env.CRON_SECRET ?? '').trim(),
    cleanupEnabled: (env.CLEANUP_ENABLED ?? '').trim().toLowerCase() === 'true',
    allowedOrigins: parseCsv(env.ALLOWED_ORIGINS),
  };
};

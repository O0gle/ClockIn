/**
 * 微信小程序代码上传脚本（官方 CI 工具，无需打开微信开发者工具）
 *
 * 用法：
 *   MP_KEY=D:/codes/ClockIn/private.key MP_VERSION=1.0.0 node scripts/upload-ci.js
 *
 * 环境变量：
 *   MP_APPID    小程序 AppID（默认读取 project.config.json）
 *   MP_KEY      代码上传密钥 private.key 的绝对路径（必需）
 *   MP_VERSION  版本号，如 1.0.0（默认 1.0.0）
 *   MP_DESC     版本备注（默认：弹性打卡助手 自用版）
 */
const fs = require('fs');
const path = require('path');
const ci = require('miniprogram-ci');

const projectRoot = path.resolve(__dirname, '..');

const projectConfig = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'project.config.json'), 'utf8')
);

// 优先读取本地私有配置 project.private.config.json（不入库），兼容开源 project.config.json 占位 AppID
let privateConfig = {};
const privateConfigPath = path.join(projectRoot, 'project.private.config.json');
if (fs.existsSync(privateConfigPath)) {
  try {
    privateConfig = JSON.parse(fs.readFileSync(privateConfigPath, 'utf8'));
  } catch (e) {}
}

const appid =
  process.env.MP_APPID ||
  privateConfig.appid ||
  (projectConfig.appid && projectConfig.appid !== 'touristappid' ? projectConfig.appid : '');

// 自动检测目录下 private*.key 密钥文件，优先匹配当前 AppID
let detectedKeyPath = '';
try {
  const allFiles = fs.readdirSync(projectRoot);
  const matchedKey =
    allFiles.find((f) => f === `private.${appid}.key`) ||
    allFiles.find((f) => f === 'private.key') ||
    allFiles.find((f) => f.startsWith('private.') && f.endsWith('.key'));
  if (matchedKey) {
    detectedKeyPath = path.join(projectRoot, matchedKey);
  }
} catch (e) {}

const privateKeyPath =
  process.env.MP_KEY ||
  detectedKeyPath ||
  path.join(projectRoot, `private.${appid}.key`);

// 版本号自增处理：末位版本号递增 1
function bumpPatchVersion(ver) {
  const parts = String(ver).trim().split('.');
  if (parts.length > 0) {
    const last = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(last)) {
      parts[parts.length - 1] = String(last + 1);
      return parts.join('.');
    }
  }
  return ver + '.1';
}

const packageJsonPath = path.join(projectRoot, 'package.json');
const versionJsPath = path.join(projectRoot, 'utils', 'version.js');

// 1. 读取当前版本号与上次已上传版本号
let currentVersion = '2.0.0';
let lastUploadedVersion = '';

if (fs.existsSync(packageJsonPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (pkg.version) currentVersion = pkg.version;
    if (pkg.lastUploadedVersion) lastUploadedVersion = pkg.lastUploadedVersion;
  } catch (e) {}
} else if (fs.existsSync(versionJsPath)) {
  try {
    const vModule = require(versionJsPath);
    if (vModule.version) currentVersion = vModule.version;
  } catch (e) {}
}

// 2. 确定本次上传版本号：
// - 若环境变量显式指定 MP_VERSION 则采用
// - 若当前版本已人为调整升级 (currentVersion !== lastUploadedVersion)，优先采用当前版本（如 2.0.0）
// - 否则最后一位自动递增 +1，防止微信后台“版本号已存在”报错
let version;
if (process.env.MP_VERSION) {
  version = process.env.MP_VERSION;
  console.log(`[指定版本] 使用环境变量指定版本: ${version}`);
} else if (lastUploadedVersion && currentVersion !== lastUploadedVersion) {
  version = currentVersion;
  console.log(`[主动升级] 检测到版本号已主动升级为: ${version}，本次上传将使用该版本`);
} else {
  version = bumpPatchVersion(currentVersion);
  console.log(`[版本自增] 上一个版本: ${currentVersion} -> 自动递增为本次版本: ${version}`);
}

// 3. 同步最新版本回写 package.json
if (fs.existsSync(packageJsonPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    pkg.version = version;
    pkg.lastUploadedVersion = version;
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.warn('[警告] 同步 package.json 失败:', e.message);
  }
}

// 4. 同步最新版本回写 utils/version.js
try {
  fs.writeFileSync(
    versionJsPath,
    `// utils/version.js\n// 本文件由 scripts/upload-ci.js 在上传时自动维护更新\nmodule.exports = {\n  version: '${version}'\n};\n`,
    'utf8'
  );
} catch (e) {
  console.warn('[警告] 同步 utils/version.js 失败:', e.message);
}

const desc = process.env.MP_DESC || `版本 v${version} 自动发布`;

if (!appid) {
  console.error('[错误] 缺少 AppID，请设置 MP_APPID 或在 project.config.json 中填写 appid');
  process.exit(1);
}
if (!fs.existsSync(privateKeyPath)) {
  console.error(`[错误] 找不到代码上传密钥：${privateKeyPath}`);
  console.error('请到 mp.weixin.qq.com → 开发管理 → 开发设置 → 小程序代码上传密钥，下载后放到该路径');
  process.exit(1);
}

const project = new ci.Project({
  appid,
  type: 'miniProgram',
  projectPath: projectRoot,
  privateKeyPath,
  ignores: [
    'node_modules/**/*',
    '.git/**/*',
    '.workbuddy/**/*',
    'scripts/**/*',
    'cloudfunctions/**/*',
    'README.md',
    'private*.key',
    'preview-qrcode.png',
  ],
});

(async () => {
  console.log(`[上传] AppID: ${appid}  版本: ${version}`);
  const result = await ci.upload({
    project,
    version,
    desc,
    setting: {
      es6: true,
      es7: true,
      minify: true,
      minifyJS: true,
      minifyWXML: true,
      minifyWXSS: true,
      autoPrefixWXSS: true,
      codeProtect: false,
    },
    robot: 1,
    qrcodeFormat: 'image',
    qrcodeOutputDest: path.join(projectRoot, 'preview-qrcode.png'),
    pagePath: 'pages/index/index',
    onProgressUpdate: (info) => {
      console.log('[进度]', typeof info === 'object' ? JSON.stringify(info) : info);
    },
  });
  console.log('[完成]', JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error('[上传失败]', err && err.message ? err.message : err);
  process.exit(1);
});

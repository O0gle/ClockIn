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

const appid = process.env.MP_APPID || projectConfig.appid;
// 默认读取 mp 后台下载的原文件名：private.<appid>.key，也兼容改名为 private.key
const privateKeyPath =
  process.env.MP_KEY ||
  [path.join(projectRoot, `private.${appid}.key`), path.join(projectRoot, 'private.key')].find(
    (p) => fs.existsSync(p)
  ) ||
  path.join(projectRoot, `private.${appid}.key`);
const version = process.env.MP_VERSION || '1.0.0';
const desc = process.env.MP_DESC || '弹性打卡助手 自用版';

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
    'private.key',
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

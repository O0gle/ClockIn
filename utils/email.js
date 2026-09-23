/**
 * 考勤数据邮件发送与 CSV 文件导出工具
 * 支持用户在小程序本地设置：收件邮箱、发件邮箱、发件邮箱SMTP授权码
 * 结合云函数 sendMail 实现全自动邮件直发（支持带 HTML 美化排版与 Excel 附件）
 */

const attendance = require('./attendance.js');

const EMAIL_CONFIG_KEY = 'clock_in_email_config';

/**
 * 获取本地保存的邮箱配置
 */
function getEmailConfig() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const stored = wx.getStorageSync(EMAIL_CONFIG_KEY);
      if (stored && typeof stored === 'object') {
        return Object.assign({
          targetEmail: '',
          senderEmail: '',
          senderPass: '',
          senderName: '弹性打卡助手'
        }, stored);
      }
    }
  } catch (e) {
    console.error('getEmailConfig error', e);
  }
  return {
    targetEmail: '',
    senderEmail: '',
    senderPass: '',
    senderName: '弹性打卡助手'
  };
}

/**
 * 保存邮箱配置到本地缓存
 */
function saveEmailConfig(config) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(EMAIL_CONFIG_KEY, config);
    }
  } catch (e) {
    console.error('saveEmailConfig error', e);
  }
}

/**
 * 生成精美 HTML 格式的邮件正文
 */
function generateEmailHtml(year, month, statistics, settings) {
  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background-color: #f8fafc; padding: 20px; margin: 0; }
      .container { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
      .header { background: linear-gradient(135deg, #1677ff 0%, #0ea5e9 100%); color: #ffffff; padding: 30px 24px; text-align: center; }
      .header h1 { margin: 0 0 8px; font-size: 24px; font-weight: 700; letter-spacing: 1px; }
      .header p { margin: 0; font-size: 14px; opacity: 0.9; }
      .content { padding: 24px; }
      .summary-cards { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
      .card { flex: 1; min-width: 130px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center; }
      .card-ot { background: #fff7ed; border-color: #fed7aa; }
      .card-num { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
      .card-ot .card-num { color: #ea580c; }
      .card-label { font-size: 12px; color: #64748b; }
      .card-ot .card-label { color: #ea580c; font-weight: 600; }
      .rule-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px; font-size: 13px; line-height: 1.6; color: #1e3a8a; }
      .rule-box h4 { margin: 0 0 6px; font-size: 14px; color: #1d4ed8; }
      .table-title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
      th { background: #f1f5f9; color: #475569; font-weight: 600; padding: 10px 8px; text-align: center; border-bottom: 2px solid #e2e8f0; }
      td { padding: 10px 8px; text-align: center; border-bottom: 1px solid #f1f5f9; }
      tr:hover { background-color: #f8fafc; }
      .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
      .tag-weekend { background: #ede9fe; color: #7c3aed; }
      .tag-work { background: #eff6ff; color: #2563eb; }
      .tag-ot { background: #fff7ed; color: #ea580c; font-weight: 600; }
      .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>【考勤与加班明细报表】</h1>
        <p>${year}年${month}月度考勤 · 弹性打卡助手生成</p>
      </div>

      <div class="content">
        <!-- 统计汇总四宫格 -->
        <div class="summary-cards">
          <div class="card">
            <div class="card-num">${statistics.totalDays}</div>
            <div class="card-label">出勤天数 (天)</div>
          </div>
          <div class="card">
            <div class="card-num">${statistics.totalWorkHours}</div>
            <div class="card-label">出勤总工时 (小时)</div>
          </div>
          <div class="card card-ot">
            <div class="card-num">${statistics.totalOvertimeHours}</div>
            <div class="card-label">累计加班 (小时)</div>
          </div>
          <div class="card">
            <div class="card-num">${statistics.lateCount}</div>
            <div class="card-label">迟到记录 (次)</div>
          </div>
        </div>

        <!-- 规则说明框 -->
        <div class="rule-box">
          <h4>📌 考勤与加班核算规则说明</h4>
          <div>1. <b>工作日弹性上下班</b>：08:00~09:00弹性上班(基准08:30)，午休11:40~13:40(2小时)自动扣除，满7.5小时工时。</div>
          <div>2. <b>工作日加班规则</b>：到了下班时间后休息1个小时才开始计算加班时长，休息期内不计加班。</div>
          <div>3. <b>周六周日加班规则</b>：全天出勤均计为加班，中午及晚上的休息时间都全额计入加班时长。</div>
        </div>

        <!-- 每日明细表 -->
        <div class="table-title">📅 每日考勤明细清单 (共 ${statistics.records.length} 条)</div>
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>类型</th>
              <th>上班打卡</th>
              <th>下班打卡</th>
              <th>工时</th>
              <th>加班时长</th>
              <th>状态/备注</th>
            </tr>
          </thead>
          <tbody>
  `;

  if (statistics.records && statistics.records.length > 0) {
    statistics.records.forEach(r => {
      const typeBadge = r.isWeekend
        ? '<span class="tag tag-weekend">周末</span>'
        : '<span class="tag tag-work">工作日</span>';

      const otBadge = r.overtimeMinutes > 0
        ? `<span class="tag tag-ot">${r.overtimeText}</span>`
        : '<span style="color:#94a3b8">0分钟</span>';

      const remarkText = r.remark ? `<br><small style="color:#94a3b8">${r.remark}</small>` : '';

      html += `
        <tr>
          <td><b>${r.date}</b></td>
          <td>${typeBadge}</td>
          <td>${r.signInTime || '--:--'}</td>
          <td>${r.signOutTime || '--:--'}</td>
          <td>${r.workText}</td>
          <td>${otBadge}</td>
          <td>${r.summaryStatusText || '--'}${remarkText}</td>
        </tr>
      `;
    });
  } else {
    html += `<tr><td colspan="7" style="color:#94a3b8; padding: 20px;">本月暂无考勤打卡明细</td></tr>`;
  }

  html += `
          </tbody>
        </table>
        <p style="font-size: 12px; color: #64748b;">📎 本邮件同时随信附带本月标准的 Excel (CSV) 考勤明细附件，可在电脑端直接双击查看。</p>
      </div>

      <div class="footer">
        本邮件由微信小程序「弹性打卡助手」自动发送 · 发送时间：${attendance.getTodayDateStr()} ${attendance.getCurrentTimeStr()}
      </div>
    </div>
  </body>
  </html>
  `;

  return html;
}

/**
 * 格式化纯文本正文 (备用或纯文本邮件客户端)
 */
function generateEmailText(year, month, statistics, settings, allRecords) {
  let text = `【弹性考勤助手】${year}年${month}月 考勤与加班明细报表\n`;
  text += `生成时间：${attendance.getTodayDateStr()} ${attendance.getCurrentTimeStr()}\n\n`;

  text += `========================================\n`;
  text += `一、当月考勤汇总\n`;
  text += `========================================\n`;
  text += `出勤天数：${statistics.totalDays} 天\n`;
  text += `出勤总工时：${statistics.totalWorkText} (${statistics.totalWorkHours} 小时)\n`;
  text += `累计加班时长：${statistics.totalOvertimeText} (${statistics.totalOvertimeHours} 小时)\n`;
  text += `迟到次数：${statistics.lateCount} 次 | 早退次数：${statistics.earlyLeaveCount} 次\n\n`;

  text += `========================================\n`;
  text += `二、最新考勤规则说明\n`;
  text += `========================================\n`;
  text += `1. 工作日弹性打卡：08:00~09:00弹性，午休11:40~13:40自动扣除，满7.5小时工时。\n`;
  text += `2. 工作日加班规则：到了下班时间后，休息一个小时才开始计算加班时长。\n`;
  text += `3. 周六周日加班规则：全天出勤计加班，中午及晚上的休息时间都全额计入加班时长。\n\n`;

  text += `========================================\n`;
  text += `三、每日考勤明细清单\n`;
  text += `========================================\n`;

  if (statistics.records && statistics.records.length > 0) {
    statistics.records.forEach((r, idx) => {
      const typeTag = r.isWeekend ? '【周末】' : '【工作日】';
      let line = `${idx + 1}. ${r.date} ${typeTag}\n`;
      line += `   上班: ${r.signInTime || '--:--'} | 下班: ${r.signOutTime || '--:--'}`;
      if (!r.isWeekend) {
        line += ` | 预计下班: ${r.expectedSignOutTime || '--:--'} | 工时: ${r.workText}`;
        if (r.overtimeMinutes > 0) {
          line += ` | 🌟加班: ${r.overtimeText} (休息1h后起算)`;
        }
      } else {
        line += ` | 🌟周末全额加班: ${r.overtimeText} (含中午和晚上休息)`;
      }
      if (r.remark) {
        line += ` | 备注: ${r.remark}`;
      }
      text += line + '\n';
    });
  } else {
    text += `(本月暂无打卡记录)\n\n`;
  }

  // 附带完整备份 JSON 串
  text += `\n========================================\n`;
  text += `四、数据恢复备份串 (换机或恢复时可使用)\n`;
  text += `========================================\n`;
  const backupObj = {
    exportDate: new Date().toISOString(),
    year,
    month,
    records: allRecords || {}
  };
  text += JSON.stringify(backupObj) + `\n`;

  return text;
}

/**
 * 生成 CSV 表格文本 (带 UTF-8 BOM，Excel 双击直接打开不乱码)
 */
function generateCsvContent(statistics) {
  let csv = '﻿'; // UTF-8 BOM
  csv += '日期,日期类型,上班打卡,下班打卡,预计下班点,实际出勤工时(小时),加班时长(小时),考勤状态,备注说明\n';

  if (statistics.records && statistics.records.length > 0) {
    statistics.records.forEach(r => {
      const dateType = r.isWeekend ? '周末' : '工作日';
      const signIn = r.signInTime || '--:--';
      const signOut = r.signOutTime || '--:--';
      const expectedOut = r.expectedSignOutTime || '--:--';
      const workHours = r.workHours || '0.0';
      const otHours = r.overtimeHours || '0.0';
      const statusText = (r.summaryStatusText || '').replace(/,/g, '，');
      const remark = (r.remark || '').replace(/,/g, '，');

      csv += `"${r.date}","${dateType}","${signIn}","${signOut}","${expectedOut}","${workHours}","${otHours}","${statusText}","${remark}"\n`;
    });
  }

  return csv;
}

/**
 * 导出并调起打开 CSV 考勤报表文件 (可在微信中分享或保存到邮箱/文件App)
 */
function exportCsvFile(year, month, statistics, callback) {
  if (typeof wx === 'undefined') return;

  const csvData = generateCsvContent(statistics);
  const fs = wx.getFileSystemManager();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  const fileName = `考勤报表_${year}年${pad(month)}月.csv`;
  const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

  fs.writeFile({
    filePath,
    data: csvData,
    encoding: 'utf8',
    success: () => {
      wx.openDocument({
        filePath,
        fileType: 'csv',
        showMenu: true,
        success: () => {
          if (callback) callback(null, filePath);
        },
        fail: (err) => {
          console.error('openDocument fail', err);
          if (callback) callback(err);
        }
      });
    },
    fail: (err) => {
      console.error('writeFile fail', err);
      if (callback) callback(err);
    }
  });
}

/**
 * 核心：调用云函数 sendMail 发送考勤报表到指定收件邮箱
 * 参数取自本地缓存：
 * - 发件邮箱 (senderEmail)
 * - 发件邮箱授权码 (senderPass)
 * - 收件邮箱 (targetEmail)
 * @param {object} options
 * @param {number} options.year - 年份
 * @param {number} options.month - 月份
 * @param {object} options.statistics - 当月统计数据
 * @param {object} options.settings - 考勤规则设置
 * @param {function} callback - (err, result)
 */
function sendEmailReport(options, callback) {
  const { year, month, statistics, settings, allRecords } = options;
  const config = getEmailConfig();

  // 1. 基础校验
  if (!config.targetEmail) {
    if (callback) callback(new Error('未设置收件邮箱，请先在「设置」中填写接收报表的邮箱地址'));
    return;
  }
  if (!config.senderEmail) {
    if (callback) callback(new Error('未设置发件邮箱，请先在「设置」中填写您的发件邮箱账号（如QQ/163邮箱）'));
    return;
  }
  if (!config.senderPass) {
    if (callback) callback(new Error('未设置发件邮箱授权码，请先在「设置」中填写您的 16 位 SMTP 授权码'));
    return;
  }

  // 2. 检查云开发环境
  if (!wx.cloud) {
    if (callback) callback(new Error('当前微信版本过低或基础库不支持云函数，请升级微信'));
    return;
  }

  const pad = n => (n < 10 ? '0' + n : '' + n);
  const subject = `【弹性考勤助手】${year}年${pad(month)}月 考勤与加班明细报表`;
  const html = generateEmailHtml(year, month, statistics, settings);
  const text = generateEmailText(year, month, statistics, settings, allRecords);
  const csvData = generateCsvContent(statistics);
  const fileName = `考勤报表_${year}年${pad(month)}月.csv`;

  wx.showLoading({ title: '正在发送邮件...', mask: true });

  // 3. 调用 sendMail 云函数
  wx.cloud.callFunction({
    name: 'sendMail',
    data: {
      senderEmail: config.senderEmail,
      senderPass: config.senderPass,
      senderName: config.senderName || '弹性打卡助手',
      to: config.targetEmail,
      subject,
      html,
      text,
      csvData,
      fileName
    },
    success: (res) => {
      wx.hideLoading();
      if (res.result && res.result.success) {
        if (callback) callback(null, res.result);
      } else {
        const errorMsg = (res.result && (res.result.message || res.result.error)) || '邮件发送失败，请检查发信配置';
        if (callback) callback(new Error(errorMsg));
      }
    },
    fail: (err) => {
      wx.hideLoading();
      console.error('调用云函数 sendMail 失败:', err);
      let errMsg = err.errMsg || String(err);
      if (errMsg.includes('FunctionName') || errMsg.includes('not found') || errMsg.includes('cloud function not exist')) {
        errMsg = '未检测到 sendMail 云函数！请在微信开发者工具中右键 cloudfunctions/sendMail 目录，选择「上传并部署：云端安装依赖」。';
      }
      if (callback) callback(new Error(errMsg));
    }
  });
}

module.exports = {
  EMAIL_CONFIG_KEY,
  getEmailConfig,
  saveEmailConfig,
  generateEmailHtml,
  generateEmailText,
  generateCsvContent,
  exportCsvFile,
  sendEmailReport
};

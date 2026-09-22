/**
 * 考勤数据邮件发送与 CSV 文件导出工具
 */

const attendance = require('./attendance.js');

const EMAIL_CONFIG_KEY = 'clock_in_email_config';

/**
 * 获取邮箱配置
 */
function getEmailConfig() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const stored = wx.getStorageSync(EMAIL_CONFIG_KEY);
      if (stored && typeof stored === 'object') {
        return stored;
      }
    }
  } catch (e) {
    console.error('getEmailConfig error', e);
  }
  return {
    targetEmail: '',
    accessKey: ''
  };
}

/**
 * 保存邮箱配置
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
 * 格式化邮件正文 (文本版)
 */
function generateEmailText(year, month, statistics, settings, allRecords) {
  const pad = n => (n < 10 ? '0' + n : '' + n);
  let text = `【弹性考勤助手】${year}年${month}月 考勤与加班明细报表\n`;
  text += `生成时间：${attendance.getTodayDateStr()} ${attendance.getCurrentTimeStr()}\n\n`;

  text += `========================================\n`;
  text += `一、当月考勤汇总\n`;
  text += `========================================\n`;
  text += `出勤天数：${statistics.totalDays} 天\n`;
  text += `实际出勤总工时：${statistics.totalWorkText} (${statistics.totalWorkHours} 小时)\n`;
  text += `累计加班总时长：${statistics.totalOvertimeText} (${statistics.totalOvertimeHours} 小时)\n`;
  text += `迟到次数：${statistics.lateCount} 次 | 早退次数：${statistics.earlyLeaveCount} 次\n\n`;

  text += `========================================\n`;
  text += `二、最新考勤与加班规则执行标准\n`;
  text += `========================================\n`;
  text += `1. 工作日弹性上下班：基准 08:30 (±30m: 08:00 ~ 09:00)。午休 11:40 ~ 13:40 (2小时) 自动扣除，每日满 7.5 小时工时下班。\n`;
  text += `2. 工作日加班规则：周一至周五到了下班时间后，休息一个小时才开始计算加班时长，休息的1小时内不计入加班。\n`;
  text += `3. 周六周日加班规则：周六周日全天出勤均计为加班，且把中午（11:40~13:40）及晚上的休息时间都全额计入加班时长。\n\n`;

  text += `========================================\n`;
  text += `三、每日打卡与加班明细清单\n`;
  text += `========================================\n`;

  if (statistics.records && statistics.records.length > 0) {
    statistics.records.forEach((r, idx) => {
      const typeTag = r.isWeekend ? '【周末】' : '【工作日】';
      let line = `${idx + 1}. ${r.date} ${typeTag}\n`;
      line += `   上班打卡: ${r.signInTime || '--:--'} (${r.signInStatusText || '未打卡'})\n`;
      line += `   下班打卡: ${r.signOutTime || '--:--'} (${r.signOutStatusText || '未打卡'})\n`;
      if (!r.isWeekend) {
        line += `   预计下班: ${r.expectedSignOutTime || '--:--'} (满7.5h)\n`;
        line += `   出勤工时: ${r.workText}\n`;
        line += `   工作日加班: ${r.overtimeText} (下班休息1h后起算)\n`;
      } else {
        line += `   周末全额加班: ${r.overtimeText} (中午及晚间休息均全额计入)\n`;
      }
      if (r.remark) {
        line += `   备注: ${r.remark}\n`;
      }
      text += line + '\n';
    });
  } else {
    text += `(本月暂无打卡记录)\n\n`;
  }

  // 附带完整备份 JSON 串，便于未来直接恢复
  text += `========================================\n`;
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
 * 导出并调起打开 CSV 考勤报表文件 (可直接在微信中分享或保存到邮箱/文件App)
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
        showMenu: true, // 开启右上角菜单：可发送到微信、发送至邮箱或用其他应用打开
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
 * 通过免费 Web3Forms API 发送邮件至用户邮箱
 * @param {object} options
 * @param {string} options.targetEmail - 接收邮箱
 * @param {string} options.accessKey - Web3Forms Access Key
 * @param {string} options.subject - 邮件标题
 * @param {string} options.message - 邮件正文
 * @param {function} callback - (err, result)
 */
function sendEmailViaApi(options, callback) {
  const { targetEmail, accessKey, subject, message } = options;

  if (!targetEmail) {
    if (callback) callback(new Error('请先填写接收邮箱地址'));
    return;
  }

  if (!accessKey) {
    if (callback) callback(new Error('请填写 Web3Forms Access Key（可免费秒申请）'));
    return;
  }

  wx.showLoading({ title: '正在投递邮件...', mask: true });

  wx.request({
    url: 'https://api.web3forms.com/submit',
    method: 'POST',
    header: {
      'content-type': 'application/json',
      'Accept': 'application/json'
    },
    data: {
      access_key: accessKey,
      email: targetEmail,
      from_name: '弹性打卡助手',
      subject: subject || '考勤与加班数据备份',
      message: message
    },
    success: (res) => {
      wx.hideLoading();
      if (res.statusCode === 200 && res.data && res.data.success) {
        if (callback) callback(null, res.data);
      } else {
        const msg = (res.data && res.data.message) ? res.data.message : '邮件发送失败，请检查 Key 或网络';
        if (callback) callback(new Error(msg));
      }
    },
    fail: (err) => {
      wx.hideLoading();
      console.error('wx.request email fail', err);
      if (callback) callback(new Error('网络请求异常，请检查网络连接或稍后重试'));
    }
  });
}

module.exports = {
  EMAIL_CONFIG_KEY,
  getEmailConfig,
  saveEmailConfig,
  generateEmailText,
  generateCsvContent,
  exportCsvFile,
  sendEmailViaApi
};

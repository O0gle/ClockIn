/**
 * 考勤与加班报表导出工具 (纯本地与微信原生，100%免费，彻底解决乱码与卡住问题)
 */

const attendance = require('./attendance.js');

/**
 * 生成符合 Microsoft Excel 规范的表格 (.xls)
 * 特点：自带 charset=UTF-8，强制 mso-number-format:"\@" 文本格式，绝不乱码，wx.openDocument 原生支持！
 */
function generateXlsHtml(year, month, statistics) {
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${year}年${month}月考勤报表</x:Name>
          <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    table { border-collapse: collapse; width: 100%; }
    th { background-color: #2563eb; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 10px 14px; font-size: 13px; text-align: center; }
    td { border: 1px solid #cbd5e1; padding: 8px 12px; font-size: 12px; text-align: center; mso-number-format: "\\@"; }
    .tag-weekend { background-color: #ede9fe; color: #7c3aed; font-weight: bold; }
    .tag-ot { background-color: #fff7ed; color: #ea580c; font-weight: bold; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>
        <th>日期</th>
        <th>日期类型</th>
        <th>上班打卡</th>
        <th>下班打卡</th>
        <th>预计下班点</th>
        <th>实际工时(小时)</th>
        <th>加班时长(小时)</th>
        <th>考勤状态</th>
        <th>备注说明</th>
      </tr>
    </thead>
    <tbody>
`;

  if (statistics.records && statistics.records.length > 0) {
    statistics.records.forEach(r => {
      const dateType = r.isWeekend ? '周末' : '工作日';
      const signIn = r.signInTime || '--:--';
      const signOut = r.signOutTime || '--:--';
      const expectedOut = r.expectedSignOutTime || '--:--';
      const workHours = r.workHours || '0.0';
      const otHours = r.overtimeHours || '0.0';
      const statusText = r.summaryStatusText || '';
      const remark = r.remark || '';
      const trClass = r.isWeekend ? ' class="tag-weekend"' : (r.overtimeMinutes > 0 ? ' class="tag-ot"' : '');

      html += `      <tr${trClass}>
        <td>${r.date}</td>
        <td>${dateType}</td>
        <td>${signIn}</td>
        <td>${signOut}</td>
        <td>${expectedOut}</td>
        <td>${workHours}</td>
        <td>${otHours}</td>
        <td>${statusText}</td>
        <td>${remark}</td>
      </tr>\n`;
    });
  }

  html += `    </tbody>
  </table>
</body>
</html>\n`;
  return html;
}

/**
 * 导出 Excel 文件并直接打开 (微信原生支持直接预览与分享)
 */
function exportCsvFile(year, month, statistics, callback) {
  if (typeof wx === 'undefined') return;

  const pad = n => (n < 10 ? '0' + n : '' + n);
  const fs = wx.getFileSystemManager();
  const xlsContent = generateXlsHtml(year, month, statistics);
  const fileName = `考勤报表_${year}年${pad(month)}月.xls`;
  const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

  // 1. 写入本地文件
  fs.writeFile({
    filePath,
    data: xlsContent,
    encoding: 'utf8',
    success: () => {
      // 写入成功后立即隐藏 Loading 遮罩，绝不卡屏
      wx.hideLoading();

      // 2. 调起微信原生文档阅读器打开 .xls 表格
      // (打开后右上角带有原生「...」菜单，可直接发送给微信好友/文件传输助手、或用其他应用打开)
      wx.openDocument({
        filePath,
        fileType: 'xls',
        showMenu: true,
        success: () => {
          if (callback) callback(null);
        },
        fail: (openErr) => {
          console.warn('wx.openDocument fail:', openErr);
          // 若在电脑模拟器等不支持预览的环境中，自动调用 shareFileMessage 或弹窗提示
          if (typeof wx.shareFileMessage === 'function') {
            wx.shareFileMessage({
              filePath,
              fileName,
              success: () => {
                wx.showToast({ title: '已发送', icon: 'success' });
                if (callback) callback(null);
              },
              fail: () => {
                if (callback) callback(null);
              }
            });
          } else {
            wx.showModal({
              title: '表格生成完成 📊',
              content: '考勤报表已成功生成并保存在本地！\n在真机微信中点击即可直接打开表格，并通过右上角菜单发送至微信好友或文件传输助手。',
              showCancel: false,
              confirmColor: '#1677ff'
            });
            if (callback) callback(null);
          }
        }
      });
    },
    fail: (err) => {
      wx.hideLoading();
      console.error('fs.writeFile fail:', err);
      if (callback) callback(new Error('写入本地文件失败：' + (err.errMsg || '未知错误')));
    }
  });
}

/**
 * 生成全月考勤排版文本 (便于一键复制纯文本)
 */
function generateSummaryText(year, month, statistics, settings, allRecords) {
  let text = `【${year}年${month}月 弹性考勤与加班明细】\n`;
  text += `出勤天数：${statistics.totalDays} 天\n`;
  text += `出勤总工时：${statistics.totalWorkText} (${statistics.totalWorkHours} 小时)\n`;
  text += `累计加班：${statistics.totalOvertimeText} (${statistics.totalOvertimeHours} 小时)\n`;
  text += `规则说明：工作日下班休息1h起算加班，周六日全额计加班(中午/晚间休息均计入)\n`;
  text += `迟到次数：${statistics.lateCount} 次 | 早退次数：${statistics.earlyLeaveCount} 次\n`;
  text += `------------------------------------\n`;

  if (statistics.records && statistics.records.length > 0) {
    statistics.records.forEach(r => {
      let line = '';
      if (r.isWeekend) {
        line = `${r.date} (周末): 上班 ${r.signInTime || '--:--'} | 下班 ${r.signOutTime || '--:--'} | 🌟全额加班: ${r.overtimeText}`;
      } else {
        line = `${r.date}: 上班 ${r.signInTime || '--:--'} | 下班 ${r.signOutTime || '--:--'} | 预计 ${r.expectedSignOutTime || '--:--'} | 工时: ${r.workText}`;
        if (r.overtimeMinutes > 0) {
          line += ` | 🌟加班: ${r.overtimeText} (休息1h后起算)`;
        }
      }
      if (r.summaryStatusText) {
        line += ` [${r.summaryStatusText}]`;
      }
      if (r.remark) {
        line += ` (${r.remark})`;
      }
      text += line + '\n';
    });
  } else {
    text += `(本月暂无打卡记录)\n`;
  }

  // 附带完整备份 JSON 串
  text += `\n====================================\n`;
  text += `【数据恢复备份串】(换机或恢复时可直接使用)\n`;
  const backupObj = {
    exportDate: new Date().toISOString(),
    year,
    month,
    records: allRecords || {}
  };
  text += JSON.stringify(backupObj) + `\n`;

  return text;
}

module.exports = {
  generateXlsHtml,
  exportCsvFile,
  generateSummaryText
};

/**
 * 考勤与加班报表导出工具 (纯本地与微信原生，100%免费，支持单月与全量所有月份导出)
 */

const attendance = require('./attendance.js');

/**
 * 生成符合 Microsoft Excel 规范的表格 (.xls)
 * 特点：自带 charset=UTF-8，强制 mso-number-format:"\@" 文本格式，绝不乱码，wx.openDocument 原生支持！
 * @param {string} title - 表格标题
 * @param {Array} records - 待导出的考勤记录列表
 */
function generateXlsHtml(title, records) {
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${title || '考勤报表'}</x:Name>
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

  if (records && records.length > 0) {
    records.forEach(r => {
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
 * 导出 Excel 文件并直接打开 (支持全量所有月份或指定月份)
 * @param {object} options
 * @param {boolean} options.allMonths - 是否导出所有月份数据
 * @param {number} options.year - 年份 (当月模式)
 * @param {number} options.month - 月份 (当月模式)
 * @param {object} options.statistics - 单月统计数据 (可选)
 * @param {function} callback - 回调 (err)
 */
function exportExcelFile(options, callback) {
  if (typeof wx === 'undefined') return;

  const fs = wx.getFileSystemManager();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  const settings = attendance.getSettings();

  let fileName = '';
  let title = '';
  let recordList = [];

  if (options.allMonths) {
    // 导出所有月份数据：从本地存储抓取所有历史记录，按日期倒序排列
    const allRecordsMap = attendance.getAllRecords();
    const allDates = Object.keys(allRecordsMap).sort().reverse();

    if (allDates.length === 0) {
      if (callback) callback(new Error('本地暂无任何考勤打卡数据'));
      return;
    }

    recordList = allDates.map(d => attendance.evaluateRecord(allRecordsMap[d], settings));
    fileName = `全部考勤与加班报表_全量汇总.xls`;
    title = `全部考勤汇总 (共${recordList.length}天)`;
  } else {
    // 导出单月数据
    const year = options.year;
    const month = options.month;
    const stats = options.statistics || attendance.getMonthStatistics(year, month, settings);

    if (!stats || !stats.records || stats.records.length === 0) {
      if (callback) callback(new Error(`${year}年${month}月暂无考勤数据`));
      return;
    }

    recordList = stats.records;
    fileName = `考勤报表_${year}年${pad(month)}月.xls`;
    title = `${year}年${month}月考勤报表`;
  }

  const xlsContent = generateXlsHtml(title, recordList);
  const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

  // 写入本地临时文件
  fs.writeFile({
    filePath,
    data: xlsContent,
    encoding: 'utf8',
    success: () => {
      // 写入成功立即隐藏 loading 动画
      wx.hideLoading();

      // 调起微信原生文档阅读器打开 .xls 表格
      wx.openDocument({
        filePath,
        fileType: 'xls',
        showMenu: true,
        success: () => {
          if (callback) callback(null);
        },
        fail: (openErr) => {
          console.warn('wx.openDocument fail:', openErr);
          // 备选方案：若模拟器不支持打开，调起微信分享
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
              content: `考勤报表「${fileName}」已成功生成！\n在真机微信中点击即可直接预览与通过右上角菜单分享。`,
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
 * 兼容旧接口名
 */
function exportCsvFile(year, month, statistics, callback) {
  exportExcelFile({ year, month, statistics, allMonths: false }, callback);
}

module.exports = {
  generateXlsHtml,
  exportExcelFile,
  exportCsvFile
};

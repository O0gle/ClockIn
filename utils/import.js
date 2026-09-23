/**
 * 外部考勤表格导入工具 (纯本地解析，100%离线免费，无需服务器)
 * 支持格式：
 * 1. 本小程序导出的 .xls / .csv 文件
 * 2. 外部企业/自制考勤表格 (.xls HTML表格、XML Spreadsheet、.csv 文本表格)
 * 3. JSON 备份文本
 */

const attendance = require('./attendance.js');

/**
 * Excel 序列号日期转换为 YYYY-MM-DD
 * Excel 内部日期存储为天数 (如 45557 = 2024-09-22)
 */
function parseExcelSerialDate(serial) {
  const n = Number(serial);
  if (!isNaN(n) && n > 25569 && n < 60000) {
    const utcDays = Math.floor(n - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

/**
 * 智能解析日期字符串为标准 YYYY-MM-DD
 */
function parseStandardDate(str) {
  if (!str) return null;
  const s = String(str).trim();

  // 1. 匹配 Excel 序列号数字
  const serialRes = parseExcelSerialDate(s);
  if (serialRes) return serialRes;

  // 2. 匹配 YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const m1 = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m1) {
    const y = m1[1];
    const m = m1[2].padStart(2, '0');
    const d = m1[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 3. 匹配 YYYY年MM月DD日
  const m2 = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m2) {
    const y = m2[1];
    const m = m2[2].padStart(2, '0');
    const d = m2[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 4. 匹配 8位纯数字 YYYYMMDD (如 20260922)
  const m3 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m3) {
    return `${m3[1]}-${m3[2]}-${m3[3]}`;
  }

  // 5. 匹配无年份的 M/D 或 M-D (如 9/22)，自动补全当前年份
  const m4 = s.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (m4) {
    const curYear = new Date().getFullYear();
    const m = m4[1].padStart(2, '0');
    const d = m4[2].padStart(2, '0');
    return `${curYear}-${m}-${d}`;
  }

  return null;
}

/**
 * 智能解析时间字符串为标准 HH:mm
 */
function parseStandardTime(str) {
  if (!str) return '';
  const s = String(str).trim();
  if (s === '--:--' || s === '-' || s === '未打卡' || s === '无' || s === 'null' || s === '/') {
    return '';
  }

  // 匹配 HH:mm 或 HH:mm:ss
  const m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m) {
    const h = m[1].padStart(2, '0');
    const min = m[2];
    if (Number(h) < 24 && Number(min) < 60) {
      return `${h}:${min}`;
    }
  }

  return '';
}

/**
 * 解析 HTML 格式的 .xls 表格
 */
function parseHtmlXls(htmlStr) {
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(htmlStr)) !== null) {
    const rowHtml = trMatch[1];
    const cells = [];
    const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      let cellText = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      cells.push(cellText);
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * 解析微软 XML 格式的 .xls 表格 (XML Spreadsheet 2003 规范)
 */
function parseXmlSpreadsheet(xmlStr) {
  const rows = [];
  const rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(xmlStr)) !== null) {
    const rowXml = rowMatch[1];
    const cells = [];
    const cellRegex = /<Cell[^>]*>[\s\S]*?<Data[^>]*>([\s\S]*?)<\/Data>[\s\S]*?<\/Cell>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
      let cellText = cellMatch[1].replace(/<[^>]+>/g, '').trim();
      cells.push(cellText);
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * 解析 CSV / TSV 纯文本表格
 */
function parseCsv(csvStr) {
  let content = csvStr;
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  const rows = [];

  for (const line of lines) {
    const delimiter = line.includes('\t') ? '\t' : ',';
    const cells = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === delimiter && !inQuotes) {
        cells.push(cur.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        cur = '';
      } else {
        cur += c;
      }
    }
    cells.push(cur.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    rows.push(cells);
  }

  return rows;
}

/**
 * 智能探测表头列索引 (支持各种常见考勤系统列名)
 */
function findColumnIndices(headers) {
  let dateIdx = -1;
  let signInIdx = -1;
  let signOutIdx = -1;
  let remarkIdx = -1;

  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toLowerCase().replace(/\s+/g, '');

    // 日期列
    if (dateIdx === -1 && (h.includes('日期') || h.includes('date') || h === '日' || h.includes('考勤日') || h.includes('打卡日') || h.includes('工作日'))) {
      dateIdx = i;
    }

    // 上班列
    if (signInIdx === -1 && (
      h.includes('上班打卡') || h.includes('上班时间') || h.includes('上班') ||
      h.includes('签到') || h.includes('signin') || h.includes('上打卡') ||
      h.includes('进门') || h.includes('打卡1') || (h.includes('上') && h.includes('卡')) ||
      h.includes('到岗') || h.includes('第一次')
    )) {
      signInIdx = i;
    }

    // 下班列
    if (signOutIdx === -1 && (
      h.includes('下班打卡') || h.includes('下班时间') || h.includes('下班') ||
      h.includes('签退') || h.includes('signout') || h.includes('下打卡') ||
      h.includes('出门') || h.includes('打卡2') || (h.includes('下') && h.includes('卡')) ||
      h.includes('离岗') || h.includes('最后一次')
    )) {
      signOutIdx = i;
    }

    // 备注列
    if (remarkIdx === -1 && (h.includes('备注') || h.includes('说明') || h.includes('note') || h.includes('remark'))) {
      remarkIdx = i;
    }
  }

  // 兜底顺序判断
  if (dateIdx === -1 && headers.length > 0) dateIdx = 0;
  if (signInIdx === -1 && headers.length > 2) signInIdx = 2;
  if (signOutIdx === -1 && headers.length > 3) signOutIdx = 3;

  return { dateIdx, signInIdx, signOutIdx, remarkIdx };
}

/**
 * 解析表格二维数组为结构化考勤记录
 */
function parseRowsToRecords(rows, settings) {
  if (!rows || rows.length < 2) {
    return { success: false, message: '表格为空或未找到有效数据行' };
  }

  const headers = rows[0];
  const { dateIdx, signInIdx, signOutIdx, remarkIdx } = findColumnIndices(headers);

  if (dateIdx === -1) {
    return { success: false, message: '未找到日期列，请确认表格包含“日期”表头' };
  }

  const parsedRecords = {};
  let validCount = 0;
  let minDate = '';
  let maxDate = '';

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawDate = row[dateIdx];
    const stdDate = parseStandardDate(rawDate);
    if (!stdDate) continue;

    const rawIn = signInIdx >= 0 ? row[signInIdx] : '';
    const rawOut = signOutIdx >= 0 ? row[signOutIdx] : '';
    const rawRemark = remarkIdx >= 0 ? row[remarkIdx] : '';

    const signInTime = parseStandardTime(rawIn);
    const signOutTime = parseStandardTime(rawOut);

    const evaluated = attendance.evaluateRecord({
      date: stdDate,
      signInTime: signInTime || '',
      signOutTime: signOutTime || '',
      remark: (rawRemark || '').trim()
    }, settings);

    parsedRecords[stdDate] = evaluated;
    validCount++;

    if (!minDate || stdDate < minDate) minDate = stdDate;
    if (!maxDate || stdDate > maxDate) maxDate = stdDate;
  }

  if (validCount === 0) {
    return { success: false, message: '未能从表格中解析出有效日期，请检查表格内容' };
  }

  return {
    success: true,
    count: validCount,
    minDate,
    maxDate,
    records: parsedRecords
  };
}

/**
 * 解析文件内容文本 (自动判断 HTML .xls、XML .xls、CSV 还是 JSON)
 */
function parseFileContent(contentStr, fileName, settings) {
  if (!contentStr || typeof contentStr !== 'string') {
    return { success: false, message: '文件内容为空' };
  }

  const clean = contentStr.trim();

  // 1. JSON
  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const json = JSON.parse(clean);
      if (json.records && typeof json.records === 'object') {
        const records = {};
        let count = 0;
        let minDate = '';
        let maxDate = '';

        Object.keys(json.records).forEach(d => {
          const rec = json.records[d];
          const stdDate = parseStandardDate(d) || parseStandardDate(rec.date);
          if (stdDate) {
            records[stdDate] = attendance.evaluateRecord(rec, settings);
            count++;
            if (!minDate || stdDate < minDate) minDate = stdDate;
            if (!maxDate || stdDate > maxDate) maxDate = stdDate;
          }
        });

        if (count > 0) {
          return { success: true, count, minDate, maxDate, records };
        }
      }
    } catch (e) {
      // 忽略继续尝试
    }
  }

  // 2. HTML 表格 (.xls)
  if (clean.includes('<table') || clean.includes('<TR') || clean.includes('<tr')) {
    const rows = parseHtmlXls(clean);
    return parseRowsToRecords(rows, settings);
  }

  // 3. XML Spreadsheet (.xls)
  if (clean.includes('<Row') || clean.includes('<row') || clean.includes('<Workbook') || clean.includes('<Table')) {
    const rows = parseXmlSpreadsheet(clean);
    if (rows && rows.length >= 2) {
      return parseRowsToRecords(rows, settings);
    }
  }

  // 4. CSV / TSV
  const rows = parseCsv(clean);
  return parseRowsToRecords(rows, settings);
}

/**
 * 调起微信聊天文件选择器导入外部表格
 */
function chooseAndImportExcel(settings, callback) {
  if (typeof wx === 'undefined') return;

  wx.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['xls', 'xlsx', 'csv', 'txt'],
    success: (res) => {
      const file = res.tempFiles && res.tempFiles[0];
      if (!file) {
        if (callback) callback(new Error('未选择任何文件'));
        return;
      }

      wx.showLoading({ title: '正在读取表格...', mask: true });

      const fs = wx.getFileSystemManager();

      fs.readFile({
        filePath: file.path,
        encoding: 'utf8',
        success: (readRes) => {
          const content = readRes.data;
          const parseRes = parseFileContent(content, file.name, settings);
          wx.hideLoading();

          if (!parseRes.success) {
            if (callback) callback(new Error(parseRes.message || '表格解析失败'));
            return;
          }

          parseRes.fileName = file.name;
          if (callback) callback(null, parseRes);
        },
        fail: (readErr) => {
          wx.hideLoading();
          console.error('readFile fail:', readErr);
          if (callback) callback(new Error('读取本地文件失败：' + (readErr.errMsg || '未知错误')));
        }
      });
    },
    fail: (chooseErr) => {
      if (chooseErr.errMsg && chooseErr.errMsg.includes('cancel')) {
        return;
      }
      if (callback) callback(new Error('选择文件失败：' + (chooseErr.errMsg || '')));
    }
  });
}

module.exports = {
  parseStandardDate,
  parseStandardTime,
  parseHtmlXls,
  parseXmlSpreadsheet,
  parseCsv,
  findColumnIndices,
  parseFileContent,
  chooseAndImportExcel
};

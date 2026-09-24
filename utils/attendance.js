/**
 * 考勤与打卡规则计算工具类
 */

// 默认考勤规则设置
const DEFAULT_SETTINGS = {
  baseStartTime: '08:30',      // 上班基准时间
  startFlexMinutes: 30,        // 上班弹性分钟数 (8:30前后各30分钟 => 08:00 ~ 09:00)
  baseEndTime: '18:00',        // 下班基准时间
  endFlexMinutes: 30,          // 下班弹性分钟数 (18:00前后各30分钟 => 17:30 ~ 18:30)
  lunchStart: '11:40',         // 午休开始时间
  lunchEnd: '13:40',           // 午休结束时间 (120分钟，工作日不计入工作时长)
  weekdayRestMinutes: 60,      // 工作日下班后休息时长 (默认休息1小时后开始计算加班)
  standardWorkMinutes: 450     // 标准工作时长 7.5小时 (450分钟)
};

const STORAGE_KEYS = {
  SETTINGS: 'clock_in_settings',
  RECORDS: 'clock_in_records'
};

/**
 * 判断指定日期字符串是否为周末 (周六或周日)
 * @param {string} dateStr - 格式 YYYY-MM-DD
 * @returns {boolean} true: 周六或周日; false: 周一至周五
 */
function isWeekendDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const parts = dateStr.split('-');
  if (parts.length < 3) return false;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const day = d.getDay(); // 0 是周日, 6 是周六
  return day === 0 || day === 6;
}

/**
 * 判断指定时间是否在凌晨禁打卡时段 (00:00 ~ 06:59)
 * @param {Date|string} dateOrTime - Date 对象或 "HH:mm" 字符串
 * @returns {boolean} true: 处于受限时段; false: 正常打卡时段
 */
function isRestrictedPunchTime(dateOrTime) {
  let h = 0;
  let m = 0;
  if (dateOrTime instanceof Date) {
    h = dateOrTime.getHours();
    m = dateOrTime.getMinutes();
  } else if (typeof dateOrTime === 'string' && dateOrTime.includes(':')) {
    const [hStr, mStr] = dateOrTime.split(':');
    h = parseInt(hStr, 10) || 0;
    m = parseInt(mStr, 10) || 0;
  } else {
    const now = new Date();
    h = now.getHours();
    m = now.getMinutes();
  }
  const totalMins = h * 60 + m;
  // 00:00 (0) 至 06:59 (419 分钟) 不可打卡
  return totalMins >= 0 && totalMins < 420;
}

/**
 * 时间字符串转当天总分钟数 (如 "08:30" => 510)
 */
function timeStrToMinutes(str) {
  if (!str || typeof str !== 'string' || !str.includes(':')) return 0;
  const [h, m] = str.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 分钟数转时间字符串 (如 510 => "08:30")
 */
function minutesToTimeStr(totalMinutes) {
  if (isNaN(totalMinutes)) return '--:--';
  let mins = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(mins / 60) % 24;
  const remainingMins = mins % 60;
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${pad(hours)}:${pad(remainingMins)}`;
}

/**
 * 格式化时长为易读文本 (如 450 => "7小时30分钟", 90 => "1小时30分钟")
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0分钟';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return `${hours}小时${mins}分钟`;
  } else if (hours > 0) {
    return `${hours}小时`;
  } else {
    return `${mins}分钟`;
  }
}

/**
 * 格式化时长为小时小数 (如 90 => "1.5")
 */
function formatHoursDecimal(minutes) {
  if (!minutes || minutes <= 0) return '0.0';
  return (minutes / 60).toFixed(1);
}

/**
 * 获取考勤设置
 */
function getSettings() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const stored = wx.getStorageSync(STORAGE_KEYS.SETTINGS);
      if (stored && typeof stored === 'object') {
        return Object.assign({}, DEFAULT_SETTINGS, stored);
      }
    }
  } catch (e) {
    console.error('getSettings error', e);
  }
  return Object.assign({}, DEFAULT_SETTINGS);
}

/**
 * 保存考勤设置
 */
function saveSettings(settings) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(STORAGE_KEYS.SETTINGS, settings);
    }
  } catch (e) {
    console.error('saveSettings error', e);
  }
}

/**
 * 根据上班打卡时间推算预计下班时间 (工作日)
 * 规则：
 * - 工作日：满 7.5 小时工作制 + 2小时午休 (11:40 - 13:40) = 在岗需 9.5 小时 (570分钟)
 * - 08:30 前后弹性半小时 (08:00 ~ 09:00):
 *   - 08:00 打卡 => 17:30 下班 (08:00 + 9h30m)
 *   - 08:15 打卡 => 17:45 下班 (08:15 + 9h30m)
 *   - 08:30 打卡 => 18:00 下班 (08:30 + 9h30m)
 *   - 09:00 打卡 => 18:30 下班 (09:00 + 9h30m)
 * - 早于 08:00 打卡：以 08:00 起算弹性工作，预计最早下班时间 17:30
 * - 晚于 09:00 打卡：迟到，预计下班时间按打卡时间顺延满 7.5 小时工时 (打卡时间 + 9h30m)
 * - 周末：不设固定满工时点，全天计入加班
 */
function calculateExpectedSignOut(signInTimeStr, customSettings, dateStr) {
  const settings = customSettings || getSettings();
  if (!signInTimeStr) return null;

  if (dateStr && isWeekendDate(dateStr)) {
    return {
      expectedSignOutTime: '全计加班',
      expectedOutMins: 0,
      status: 'weekend',
      note: '周末出勤全计加班',
      effectiveStartMins: timeStrToMinutes(signInTimeStr),
      earliestFlexTime: '--:--',
      latestFlexTime: '--:--'
    };
  }

  const signInMins = timeStrToMinutes(signInTimeStr);
  const baseStartMins = timeStrToMinutes(settings.baseStartTime); // 510 (08:30)
  const earliestFlexMins = baseStartMins - settings.startFlexMinutes; // 480 (08:00)
  const latestFlexMins = baseStartMins + settings.startFlexMinutes; // 540 (09:00)

  const lunchStartMins = timeStrToMinutes(settings.lunchStart); // 700 (11:40)
  const lunchEndMins = timeStrToMinutes(settings.lunchEnd); // 820 (13:40)
  const lunchBreakMins = Math.max(0, lunchEndMins - lunchStartMins); // 120分钟

  const targetWorkMins = settings.standardWorkMinutes || 450; // 450分钟 (7.5小时)
  const totalPresenceMins = targetWorkMins + lunchBreakMins; // 570分钟 (9.5小时)

  let effectiveStartMins = signInMins;
  let status = 'normal'; // 'early', 'normal', 'late'
  let note = '正常弹性区间';

  if (signInMins < earliestFlexMins) {
    // 早于08:00
    effectiveStartMins = earliestFlexMins; // 弹性最早从08:00开始计
    status = 'early';
    const diff = earliestFlexMins - signInMins;
    note = `早到${diff}分钟(弹性自${settings.baseStartTime}前30分起计)`;
  } else if (signInMins > latestFlexMins) {
    // 晚于09:00
    status = 'late';
    const diff = signInMins - latestFlexMins;
    note = `迟到${diff}分钟`;
  }

  // 预计下班时间 = 有效打卡时间 + 9.5小时 (7.5h工作 + 2h午休)
  const expectedOutMins = effectiveStartMins + totalPresenceMins;
  const expectedSignOutTime = minutesToTimeStr(expectedOutMins);

  return {
    expectedSignOutTime,
    expectedOutMins,
    status,
    note,
    effectiveStartMins,
    earliestFlexTime: minutesToTimeStr(earliestFlexMins),
    latestFlexTime: minutesToTimeStr(latestFlexMins)
  };
}

/**
 * 计算实际工作时长
 * - 工作日：扣除午休 11:40 ~ 13:40 (120分钟)
 * - 周末：把中午、晚上的休息时间都计入加班/工作时长 (不扣除午休与晚餐休息)
 */
function calculateWorkDuration(signInTimeStr, signOutTimeStr, customSettings, dateStr) {
  const settings = customSettings || getSettings();
  if (!signInTimeStr || !signOutTimeStr) return 0;

  const inMins = timeStrToMinutes(signInTimeStr);
  const outMins = timeStrToMinutes(signOutTimeStr);

  if (outMins <= inMins) return 0;

  const totalSpan = outMins - inMins;

  // 如果是周末，把中午和晚上的休息时间都计入加班时长 (即不扣除午休)
  if (dateStr && isWeekendDate(dateStr)) {
    return totalSpan;
  }

  // 工作日扣除午休重叠时间
  const lunchStartMins = timeStrToMinutes(settings.lunchStart); // 700 (11:40)
  const lunchEndMins = timeStrToMinutes(settings.lunchEnd); // 820 (13:40)

  const overlapStart = Math.max(inMins, lunchStartMins);
  const overlapEnd = Math.min(outMins, lunchEndMins);
  const lunchOverlap = Math.max(0, overlapEnd - overlapStart);

  return Math.max(0, totalSpan - lunchOverlap);
}

/**
 * 计算加班时长 (核心规则修正)
 * 1、周一到周五工作日：到了下班时间后休息一个小时才开始计算加班时长；
 *    - 下班时间为满7.5h的预计下班时间 (expectedOutMins，例如08:30上班则18:00下班，休息1h后从19:00起计)
 *    - 休息期 (预计下班 ~ 预计下班+1h) 不计入加班
 *    - 超过 (预计下班+1h) 后，超出部分全额计入加班时长
 * 2、周六周日周末：把中午、晚上的休息时间都计入加班时长；
 *    - 全天出勤均为加班，且不扣除中午 (11:40~13:40) 及晚上休息时间
 *    - 加班时长 = 下班打卡时间 - 上班打卡时间 (完整跨度)
 *
 * @param {string} dateStr - 打卡日期 YYYY-MM-DD
 * @param {string} signInTimeStr - 上班时间 HH:mm
 * @param {string} signOutTimeStr - 下班时间 HH:mm
 * @param {number|string} expectedOutTimeOrMins - 预计下班时间 (工作日用)
 * @param {object} customSettings - 考勤设置
 */
function calculateOvertimeDuration(dateStr, signInTimeStr, signOutTimeStr, expectedOutTimeOrMins, customSettings) {
  const settings = customSettings || getSettings();
  if (!signOutTimeStr) return 0;

  const outMins = timeStrToMinutes(signOutTimeStr);

  // 规则 2：周六周日加班时长的计算：把中午、晚上的休息时间都计入加班时长
  if (dateStr && isWeekendDate(dateStr)) {
    if (!signInTimeStr) return 0;
    const inMins = timeStrToMinutes(signInTimeStr);
    if (outMins > inMins) {
      return outMins - inMins; // 完整时长，中午与晚上休息均计入
    }
    return 0;
  }

  // 规则 1：周一到周五工作日加班时长：到了下班时间后休息一个小时才开始计算加班时长
  let expectedOutMins = 0;
  if (typeof expectedOutTimeOrMins === 'number' && expectedOutTimeOrMins > 0) {
    expectedOutMins = expectedOutTimeOrMins;
  } else if (typeof expectedOutTimeOrMins === 'string' && expectedOutTimeOrMins.includes(':')) {
    expectedOutMins = timeStrToMinutes(expectedOutTimeOrMins);
  } else if (signInTimeStr) {
    const exp = calculateExpectedSignOut(signInTimeStr, settings, dateStr);
    expectedOutMins = exp ? exp.expectedOutMins : 0;
  }

  // 如果无法推算预计下班时间 (如未打上班卡)，使用基准下班时间 (18:00)
  if (!expectedOutMins) {
    expectedOutMins = timeStrToMinutes(settings.baseEndTime); // 1080 (18:00)
  }

  // 下班后休息时长 (默认60分钟 = 1小时)
  const restMinutes = typeof settings.weekdayRestMinutes === 'number' ? settings.weekdayRestMinutes : 60;
  const overtimeStartMins = expectedOutMins + restMinutes;

  if (outMins > overtimeStartMins) {
    return outMins - overtimeStartMins;
  }
  return 0;
}

/**
 * 获取工作日加班起算时间点 (如预计18:00下班，休息1h后是19:00)
 */
function getWeekdayOvertimeStartTime(expectedOutMins, customSettings) {
  const settings = customSettings || getSettings();
  const restMinutes = typeof settings.weekdayRestMinutes === 'number' ? settings.weekdayRestMinutes : 60;
  const baseOut = expectedOutMins || timeStrToMinutes(settings.baseEndTime);
  return minutesToTimeStr(baseOut + restMinutes);
}

/**
 * 综合评估并补全单条打卡记录各项字段
 */
function evaluateRecord(rawRecord, customSettings) {
  const settings = customSettings || getSettings();
  const record = Object.assign({}, rawRecord);
  const isWeekend = isWeekendDate(record.date);
  record.isWeekend = isWeekend;

  const baseStartMins = timeStrToMinutes(settings.baseStartTime); // 08:30 (510)
  const earliestFlexMins = baseStartMins - settings.startFlexMinutes; // 08:00 (480)
  const latestFlexMins = baseStartMins + settings.startFlexMinutes; // 09:00 (540)
  const restMinutes = typeof settings.weekdayRestMinutes === 'number' ? settings.weekdayRestMinutes : 60;

  // 1. 周末考勤计算
  if (isWeekend) {
    record.expectedSignOutTime = '周末全计加班';
    record.expectedOutMins = 0;
    record.overtimeStartHint = '全天计加班(含中午晚上休息)';

    if (record.signInTime) {
      record.signInStatus = 'weekend';
      record.signInStatusText = '周末打卡';
      record.signInTagType = 'accent';
    } else {
      record.signInStatus = 'none';
      record.signInStatusText = '未打卡';
      record.signInTagType = 'default';
    }

    if (record.signOutTime) {
      const overtimeMins = calculateOvertimeDuration(record.date, record.signInTime, record.signOutTime, null, settings);
      record.overtimeMinutes = overtimeMins;
      record.overtimeText = formatDuration(overtimeMins);
      record.overtimeHours = formatHoursDecimal(overtimeMins);
      record.workMinutes = overtimeMins; // 周末出勤全计为加班工时
      record.workText = formatDuration(overtimeMins);
      record.workHours = formatHoursDecimal(overtimeMins);

      record.signOutStatus = 'weekend_overtime';
      record.signOutStatusText = `周末加班 ${record.overtimeText}`;
      record.signOutTagType = 'accent';
    } else {
      record.signOutStatus = 'none';
      record.signOutStatusText = '未打卡';
      record.signOutTagType = 'default';
      record.workMinutes = 0;
      record.workText = '--';
      record.overtimeMinutes = 0;
      record.overtimeText = '0分钟';
      record.overtimeHours = '0.0';
    }

    if (!record.signInTime && !record.signOutTime) {
      record.summaryStatus = 'weekend_off';
      record.summaryStatusText = '周末休息';
    } else if (record.signInTime && !record.signOutTime) {
      record.summaryStatus = 'working';
      record.summaryStatusText = '周末加班中';
    } else {
      record.summaryStatus = 'weekend_overtime';
      record.summaryStatusText = `周末加班 (${record.overtimeText})`;
    }

    return record;
  }

  // 2. 工作日考勤计算 (周一至周五)
  if (record.signInTime) {
    const expected = calculateExpectedSignOut(record.signInTime, settings, record.date);
    record.expectedSignOutTime = expected.expectedSignOutTime;
    record.expectedOutMins = expected.expectedOutMins;

    const inMins = timeStrToMinutes(record.signInTime);
    if (inMins < earliestFlexMins) {
      record.signInStatus = 'early';
      record.signInStatusText = `早到 (08:00起计)`;
      record.signInTagType = 'info';
    } else if (inMins > latestFlexMins) {
      record.signInStatus = 'late';
      record.signInStatusText = `迟到 ${inMins - latestFlexMins}分钟`;
      record.signInTagType = 'warning';
    } else {
      record.signInStatus = 'normal';
      record.signInStatusText = '正常弹性';
      record.signInTagType = 'success';
    }

    // 工作日加班起算点：到了下班时间后休息1小时
    const otStartMins = record.expectedOutMins + restMinutes;
    record.overtimeStartTime = minutesToTimeStr(otStartMins);
    record.overtimeStartHint = `满工时(${record.expectedSignOutTime})后休息${restMinutes}分钟起算 (即${record.overtimeStartTime})`;
  } else {
    record.signInStatus = 'none';
    record.signInStatusText = '未打卡';
    record.signInTagType = 'default';
    const defaultExpectedOut = timeStrToMinutes(settings.baseEndTime);
    record.overtimeStartTime = minutesToTimeStr(defaultExpectedOut + restMinutes);
    record.overtimeStartHint = `下班休息${restMinutes}分钟起算 (即${record.overtimeStartTime})`;
  }

  // 计算工作日工作时长与加班时长
  if (record.signOutTime) {
    const outMins = timeStrToMinutes(record.signOutTime);
    const overtimeMins = calculateOvertimeDuration(record.date, record.signInTime, record.signOutTime, record.expectedOutMins, settings);
    record.overtimeMinutes = overtimeMins;
    record.overtimeText = formatDuration(overtimeMins);
    record.overtimeHours = formatHoursDecimal(overtimeMins);

    if (record.signInTime) {
      const workMins = calculateWorkDuration(record.signInTime, record.signOutTime, settings, record.date);
      record.workMinutes = workMins;
      record.workText = formatDuration(workMins);
      record.workHours = formatHoursDecimal(workMins);

      // 下班状态评估
      if (record.expectedOutMins && outMins < record.expectedOutMins) {
        const diff = record.expectedOutMins - outMins;
        record.signOutStatus = 'early_leave';
        record.signOutStatusText = `早退 ${diff}分钟`;
        record.signOutTagType = 'warning';
      } else if (overtimeMins > 0) {
        record.signOutStatus = 'overtime';
        record.signOutStatusText = `加班 ${record.overtimeText}`;
        record.signOutTagType = 'accent';
      } else {
        record.signOutStatus = 'normal';
        record.signOutStatusText = '正常下班';
        record.signOutTagType = 'success';
      }
    } else {
      record.workMinutes = 0;
      record.workText = '0分钟';
      record.signOutStatus = 'normal';
      record.signOutStatusText = '已打下班卡';
      record.signOutTagType = 'default';
    }
  } else {
    record.signOutStatus = 'none';
    record.signOutStatusText = '未打卡';
    record.signOutTagType = 'default';
    record.workMinutes = 0;
    record.workText = '--';
    record.overtimeMinutes = 0;
    record.overtimeText = '0分钟';
    record.overtimeHours = '0.0';
  }

  // 总体考勤状态
  if (!record.signInTime && !record.signOutTime) {
    record.summaryStatus = 'unpunched';
    record.summaryStatusText = '未打卡';
  } else if (record.signInTime && !record.signOutTime) {
    record.summaryStatus = 'working';
    record.summaryStatusText = '工作中';
  } else {
    if (record.signInStatus === 'late' && record.signOutStatus === 'early_leave') {
      record.summaryStatus = 'late_and_early';
      record.summaryStatusText = '迟到且早退';
    } else if (record.signInStatus === 'late') {
      record.summaryStatus = 'late';
      record.summaryStatusText = '迟到';
    } else if (record.signOutStatus === 'early_leave') {
      record.summaryStatus = 'early_leave';
      record.summaryStatusText = '早退';
    } else if (record.overtimeMinutes > 0) {
      record.summaryStatus = 'overtime';
      record.summaryStatusText = `加班 (${record.overtimeText})`;
    } else {
      record.summaryStatus = 'normal';
      record.summaryStatusText = '正常';
    }
  }

  return record;
}

/**
 * 获取今天日期字符串 (格式: YYYY-MM-DD)
 */
function getTodayDateStr(dateObj) {
  const d = dateObj || new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * 获取当前时间字符串 (格式: HH:mm)
 */
function getCurrentTimeStr(dateObj) {
  const d = dateObj || new Date();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${pad(hours)}:${pad(minutes)}`;
}

/**
 * 获取所有打卡记录对象
 */
function getAllRecords() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const records = wx.getStorageSync(STORAGE_KEYS.RECORDS);
      if (records && typeof records === 'object') {
        return records;
      }
    }
  } catch (e) {
    console.error('getAllRecords error', e);
  }
  return {};
}

/**
 * 保存所有打卡记录对象
 */
function saveAllRecords(records) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(STORAGE_KEYS.RECORDS, records);
    }
  } catch (e) {
    console.error('saveAllRecords error', e);
  }
}

/**
 * 根据日期获取打卡记录
 */
function getRecordByDate(dateStr, customSettings) {
  const settings = customSettings || getSettings();
  const records = getAllRecords();
  const raw = records[dateStr];
  if (!raw) {
    return evaluateRecord({ date: dateStr }, settings);
  }
  return evaluateRecord(raw, settings);
}

/**
 * 更新或保存单日打卡记录
 */
function saveDailyRecord(record, customSettings) {
  const settings = customSettings || getSettings();
  const records = getAllRecords();
  const evaluated = evaluateRecord(record, settings);
  records[evaluated.date] = evaluated;
  saveAllRecords(records);
  return evaluated;
}

/**
 * 删除单日打卡记录
 */
function deleteDailyRecord(dateStr) {
  const records = getAllRecords();
  if (records[dateStr]) {
    delete records[dateStr];
    saveAllRecords(records);
    return true;
  }
  return false;
}

/**
 * 获取某月份的考勤统计
 */
function getMonthStatistics(year, month, customSettings) {
  const settings = customSettings || getSettings();
  const records = getAllRecords();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  const prefix = `${year}-${pad(month)}`;

  let totalDays = 0;
  let totalWorkMinutes = 0;
  let totalOvertimeMinutes = 0;
  let lateCount = 0;
  let earlyLeaveCount = 0;
  let overtimeDays = 0;
  let normalDays = 0;
  let weekendOvertimeDays = 0;

  const monthRecords = [];

  Object.keys(records).forEach(date => {
    if (date.startsWith(prefix)) {
      const rec = evaluateRecord(records[date], settings);
      monthRecords.push(rec);

      if (rec.signInTime || rec.signOutTime) {
        totalDays++;
      }
      if (rec.workMinutes > 0) {
        totalWorkMinutes += rec.workMinutes;
      }
      if (rec.overtimeMinutes > 0) {
        totalOvertimeMinutes += rec.overtimeMinutes;
        overtimeDays++;
        if (rec.isWeekend) {
          weekendOvertimeDays++;
        }
      }
      if (rec.signInStatus === 'late') {
        lateCount++;
      }
      if (rec.signOutStatus === 'early_leave') {
        earlyLeaveCount++;
      }
      if (rec.signInStatus === 'normal' && (rec.signOutStatus === 'normal' || rec.signOutStatus === 'overtime')) {
        normalDays++;
      }
    }
  });

  // 按日期降序排序
  monthRecords.sort((a, b) => b.date.localeCompare(a.date));

  return {
    year,
    month,
    totalDays,
    totalWorkMinutes,
    totalWorkHours: formatHoursDecimal(totalWorkMinutes),
    totalWorkText: formatDuration(totalWorkMinutes),
    totalOvertimeMinutes,
    totalOvertimeHours: formatHoursDecimal(totalOvertimeMinutes),
    totalOvertimeText: formatDuration(totalOvertimeMinutes),
    lateCount,
    earlyLeaveCount,
    overtimeDays,
    normalDays,
    weekendOvertimeDays,
    records: monthRecords
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  isWeekendDate,
  timeStrToMinutes,
  minutesToTimeStr,
  formatDuration,
  formatHoursDecimal,
  getSettings,
  saveSettings,
  calculateExpectedSignOut,
  calculateWorkDuration,
  calculateOvertimeDuration,
  getWeekdayOvertimeStartTime,
  evaluateRecord,
  isRestrictedPunchTime,
  getTodayDateStr,
  getCurrentTimeStr,
  getAllRecords,
  saveAllRecords,
  getRecordByDate,
  saveDailyRecord,
  deleteDailyRecord,
  getMonthStatistics
};

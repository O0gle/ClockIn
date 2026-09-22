// pages/records/records.js
const attendance = require('../../utils/attendance.js');
const emailUtil = require('../../utils/email.js');

Page({
  data: {
    // 当前选择的年月
    currentYear: 2026,
    currentMonth: 9,
    monthPickerValue: '2026-09',

    // 视图模式: 'calendar' | 'list'
    viewMode: 'calendar',

    // 当月统计数据
    statistics: null,

    // 日历网格数据
    calendarDays: [],
    selectedDateStr: '',
    selectedDayRecord: null,

    // 补卡/编辑弹窗
    showEditModal: false,
    editDate: '',
    editSignInTime: '',
    editSignOutTime: '',
    editRemark: ''
  },

  onLoad() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const pad = n => (n < 10 ? '0' + n : '' + n);
    const monthPickerValue = `${currentYear}-${pad(currentMonth)}`;
    const today = attendance.getTodayDateStr(now);

    this.setData({
      currentYear,
      currentMonth,
      monthPickerValue,
      selectedDateStr: today
    });
  },

  onShow() {
    this.loadMonthData();
  },

  onPullDownRefresh() {
    this.loadMonthData();
    wx.stopPullDownRefresh();
    wx.showToast({
      title: '已刷新',
      icon: 'none'
    });
  },

  /**
   * 载入当前月份数据及日历
   */
  loadMonthData() {
    const { currentYear, currentMonth, selectedDateStr } = this.data;
    const settings = attendance.getSettings();
    const statistics = attendance.getMonthStatistics(currentYear, currentMonth, settings);
    const recordsMap = attendance.getAllRecords();

    // 构建日历网格
    const calendarDays = this.buildCalendarDays(currentYear, currentMonth, recordsMap, settings);

    // 选中的单日记录
    const dayRecord = attendance.getRecordByDate(selectedDateStr, settings);

    this.setData({
      statistics,
      calendarDays,
      selectedDayRecord: dayRecord
    });
  },

  /**
   * 生成日历网格 (包含上月补白、本月日期及考勤状态标记)
   */
  buildCalendarDays(year, month, recordsMap, settings) {
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0 是周日
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const todayStr = attendance.getTodayDateStr();

    const days = [];

    // 上月补白空白格
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({
        dayNumber: '',
        dateStr: '',
        isCurrentMonth: false,
        isToday: false,
        hasRecord: false
      });
    }

    const pad = n => (n < 10 ? '0' + n : '' + n);

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateStr = `${year}-${pad(month)}-${pad(d)}`;
      const raw = recordsMap[dateStr];
      const hasRecord = !!(raw && (raw.signInTime || raw.signOutTime));
      let rec = null;
      if (hasRecord) {
        rec = attendance.evaluateRecord(raw, settings);
      }

      const isToday = dateStr === todayStr;

      days.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
        isToday,
        hasRecord,
        record: rec,
        statusType: rec ? (rec.overtimeMinutes > 0 ? (rec.isWeekend ? 'weekend_ot' : 'overtime') : (rec.signInStatus === 'late' || rec.signOutStatus === 'early_leave' ? 'abnormal' : 'normal')) : 'none',
        overtimeText: rec && rec.overtimeMinutes > 0 ? `+${attendance.formatHoursDecimal(rec.overtimeMinutes)}h` : ''
      });
    }

    return days;
  },

  /**
   * 切换月份
   */
  onMonthChange(e) {
    const val = e.detail.value; // "YYYY-MM"
    const [y, m] = val.split('-').map(Number);
    this.setData({
      currentYear: y,
      currentMonth: m,
      monthPickerValue: val
    }, () => {
      this.loadMonthData();
    });
  },

  prevMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 1) {
      currentYear--;
      currentMonth = 12;
    } else {
      currentMonth--;
    }
    const pad = n => (n < 10 ? '0' + n : '' + n);
    this.setData({
      currentYear,
      currentMonth,
      monthPickerValue: `${currentYear}-${pad(currentMonth)}`
    }, () => {
      this.loadMonthData();
    });
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 12) {
      currentYear++;
      currentMonth = 1;
    } else {
      currentMonth++;
    }
    const pad = n => (n < 10 ? '0' + n : '' + n);
    this.setData({
      currentYear,
      currentMonth,
      monthPickerValue: `${currentYear}-${pad(currentMonth)}`
    }, () => {
      this.loadMonthData();
    });
  },

  /**
   * 切换视图 (日历 / 列表)
   */
  switchView(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      viewMode: mode
    });
  },

  /**
   * 点击日历上的某一日期
   */
  onSelectDay(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.isCurrentMonth) return;

    const settings = attendance.getSettings();
    const dayRecord = attendance.getRecordByDate(item.dateStr, settings);

    this.setData({
      selectedDateStr: item.dateStr,
      selectedDayRecord: dayRecord
    });
  },

  /**
   * 打开补卡/编辑某日弹窗
   */
  openEditModal(e) {
    const dateStr = e.currentTarget.dataset.date || this.data.selectedDateStr;
    if (!dateStr) return;

    const settings = attendance.getSettings();
    const record = attendance.getRecordByDate(dateStr, settings);

    this.setData({
      showEditModal: true,
      editDate: dateStr,
      editSignInTime: record && record.signInTime ? record.signInTime : '08:30',
      editSignOutTime: record && record.signOutTime ? record.signOutTime : '18:00',
      editRemark: record && record.remark ? record.remark : ''
    });
  },

  closeEditModal() {
    this.setData({
      showEditModal: false
    });
  },

  onEditSignInChange(e) {
    this.setData({ editSignInTime: e.detail.value });
  },

  onEditSignOutChange(e) {
    this.setData({ editSignOutTime: e.detail.value });
  },

  onEditRemarkChange(e) {
    this.setData({ editRemark: e.detail.value });
  },

  saveEditRecord() {
    const { editDate, editSignInTime, editSignOutTime, editRemark } = this.data;
    if (!editSignInTime && !editSignOutTime) {
      wx.showToast({
        title: '请至少输入上班或下班时间',
        icon: 'none'
      });
      return;
    }

    const settings = attendance.getSettings();
    const record = {
      date: editDate,
      signInTime: editSignInTime || '',
      signOutTime: editSignOutTime || '',
      remark: editRemark || ''
    };

    attendance.saveDailyRecord(record, settings);

    this.setData({
      showEditModal: false
    });

    this.loadMonthData();

    wx.showToast({
      title: '保存成功',
      icon: 'success'
    });
  },

  /**
   * 删除某日打卡记录
   */
  deleteRecord(e) {
    const dateStr = e.currentTarget.dataset.date || this.data.selectedDateStr;
    if (!dateStr) return;

    wx.showModal({
      title: '确认删除记录？',
      content: `确定要删除 ${dateStr} 的打卡记录吗？`,
      confirmColor: '#dc2626',
      success: (res) => {
        if (res.confirm) {
          attendance.deleteDailyRecord(dateStr);
          this.loadMonthData();
          wx.showToast({
            title: '已删除',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 一键复制当月考勤明细到剪贴板
   */
  exportMonthData() {
    const { statistics, currentYear, currentMonth } = this.data;
    if (!statistics || !statistics.records || statistics.records.length === 0) {
      wx.showToast({
        title: '本月暂无打卡记录',
        icon: 'none'
      });
      return;
    }

    let text = `【${currentYear}年${currentMonth}月 弹性考勤与加班明细】\n`;
    text += `出勤天数：${statistics.totalDays} 天\n`;
    text += `累计工时：${statistics.totalWorkText} (${statistics.totalWorkHours} 小时)\n`;
    text += `累计加班：${statistics.totalOvertimeText} (${statistics.totalOvertimeHours} 小时)\n`;
    text += `规则说明：工作日下班休息1h起算加班，周六日全额计加班(中午/晚间休息均计入)\n`;
    text += `迟到次数：${statistics.lateCount} 次 | 早退次数：${statistics.earlyLeaveCount} 次\n`;
    text += `------------------------------------\n`;

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

    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '复制成功 🎉',
          content: '本月考勤与加班明细已复制到剪贴板，可直接粘贴发送给主管或HR，或导入Excel报表！',
          showCancel: false,
          confirmColor: '#1677ff'
        });
      }
    });
  },

  /**
   * 发送本月考勤报表到邮箱
   */
  sendMonthEmail() {
    const { statistics, currentYear, currentMonth } = this.data;
    if (!statistics || !statistics.records || statistics.records.length === 0) {
      wx.showToast({ title: '本月暂无打卡记录', icon: 'none' });
      return;
    }

    const emailConfig = emailUtil.getEmailConfig();
    const settings = attendance.getSettings();
    const allRecords = attendance.getAllRecords();

    if (!emailConfig.targetEmail) {
      wx.showModal({
        title: '未设置备份邮箱',
        content: '尚未配置接收邮箱，是否前往「设置」页面填写邮箱？\n（您也可以先复制完整文本或导出Excel）',
        confirmText: '去设置',
        cancelText: '复制文本',
        confirmColor: '#1677ff',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/settings/settings' });
          } else {
            const body = emailUtil.generateEmailText(currentYear, currentMonth, statistics, settings, allRecords);
            wx.setClipboardData({ data: body });
          }
        }
      });
      return;
    }

    const body = emailUtil.generateEmailText(currentYear, currentMonth, statistics, settings, allRecords);
    const subject = `【弹性考勤助手】${currentYear}年${currentMonth}月 考勤与加班明细报表`;

    if (!emailConfig.accessKey) {
      wx.showActionSheet({
        itemList: ['复制完整邮件文本 (可直接粘贴发送)', '导出 Excel (CSV) 报表并分享', '前往设置配置免费直发 Key'],
        success: (res) => {
          if (res.tapIndex === 0) {
            wx.setClipboardData({ data: body });
          } else if (res.tapIndex === 1) {
            this.exportCsvReport();
          } else if (res.tapIndex === 2) {
            wx.switchTab({ url: '/pages/settings/settings' });
          }
        }
      });
      return;
    }

    emailUtil.sendEmailViaApi({
      targetEmail: emailConfig.targetEmail,
      accessKey: emailConfig.accessKey,
      subject,
      message: body
    }, (err) => {
      if (err) {
        wx.showModal({
          title: '发送遇到问题',
          content: err.message,
          confirmText: '复制文本',
          cancelText: '知道了',
          confirmColor: '#1677ff',
          success: (mRes) => {
            if (mRes.confirm) wx.setClipboardData({ data: body });
          }
        });
      } else {
        wx.showModal({
          title: '邮件已发送 📬',
          content: `考勤报表已成功发送至：\n${emailConfig.targetEmail}\n请稍后查收！`,
          showCancel: false,
          confirmColor: '#1677ff'
        });
      }
    });
  },

  /**
   * 生成并导出 CSV / Excel 文件
   */
  exportCsvReport() {
    const { statistics, currentYear, currentMonth } = this.data;
    if (!statistics || !statistics.records || statistics.records.length === 0) {
      wx.showToast({ title: '本月暂无打卡记录', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在生成表格...' });
    emailUtil.exportCsvFile(currentYear, currentMonth, statistics, (err) => {
      wx.hideLoading();
      if (err) {
        wx.showToast({ title: '文件生成失败', icon: 'none' });
      }
    });
  }
});

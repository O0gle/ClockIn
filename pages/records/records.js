// pages/records/records.js
const attendance = require('../../utils/attendance.js');
const exportUtil = require('../../utils/export.js');
const importUtil = require('../../utils/import.js');

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
    // 检查是否有新导入的数据指定要查看的目标月份
    const target = wx.getStorageSync('records_view_target_month');
    if (target && target.year && target.month) {
      const pad = n => (n < 10 ? '0' + n : '' + n);
      wx.removeStorageSync('records_view_target_month');

      // 确保在 setData 完成后精准刷新日历
      this.setData({
        currentYear: target.year,
        currentMonth: target.month,
        selectedDateStr: target.date || this.data.selectedDateStr,
        monthPickerValue: `${target.year}-${pad(target.month)}`,
        viewMode: 'calendar' // 强制确保显示日历视图
      }, () => {
        this.loadMonthData();
        if (target.count) {
          wx.showToast({
            title: `日历已更新 (${target.count}条)`,
            icon: 'success',
            duration: 2000
          });
        }
      });
      return;
    }

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

      let statusMiniText = '';
      if (rec) {
        if (rec.overtimeMinutes > 0) {
          statusMiniText = `+${attendance.formatHoursDecimal(rec.overtimeMinutes)}h`;
        } else if (rec.signInStatus === 'late') {
          statusMiniText = '迟到';
        } else if (rec.signOutStatus === 'early_leave') {
          statusMiniText = '早退';
        } else {
          statusMiniText = '正常';
        }
      }

      days.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
        isToday,
        hasRecord,
        record: rec,
        statusType: rec ? (rec.overtimeMinutes > 0 ? (rec.isWeekend ? 'weekend_ot' : 'overtime') : (rec.signInStatus === 'late' || rec.signOutStatus === 'early_leave' ? 'abnormal' : 'normal')) : 'none',
        overtimeText: rec && rec.overtimeMinutes > 0 ? `+${attendance.formatHoursDecimal(rec.overtimeMinutes)}h` : '',
        statusMiniText
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
   * 明细页底部：根据日历当前选中的月份，导出该月份的考勤报表
   */
  exportCurrentMonthExcel() {
    const { currentYear, currentMonth, statistics } = this.data;
    if (!statistics || !statistics.records || statistics.records.length === 0) {
      wx.showToast({ title: `${currentYear}年${currentMonth}月暂无考勤数据`, icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在导出表格...' });
    exportUtil.exportExcelFile({
      year: currentYear,
      month: currentMonth,
      statistics,
      allMonths: false
    }, (err) => {
      if (err) {
        wx.showModal({
          title: '导出遇到问题',
          content: err.message || '请确认微信存储权限',
          showCancel: false,
          confirmColor: '#1677ff'
        });
      }
    });
  },

  /**
   * 兼容旧调用名
   */
  exportCsvReport() {
    this.exportCurrentMonthExcel();
  },

  /**
   * 明细日历页直接导入外部表格 (直接更新日历，不弹确认view)
   */
  handleDirectImport() {
    const settings = attendance.getSettings();

    importUtil.chooseAndImportExcel(settings, (err, parseRes) => {
      if (err) {
        wx.showModal({
          title: '导入遇到问题',
          content: err.message || '解析失败，请检查文件格式',
          showCancel: false,
          confirmColor: '#1677ff'
        });
        return;
      }

      // 直接合并写入本地存储，不弹对话框打断！
      const currentRecords = attendance.getAllRecords();
      Object.assign(currentRecords, parseRes.records);
      attendance.saveAllRecords(currentRecords);

      // 直接切换到导入记录的月份并立即刷新日历！
      if (parseRes.minDate) {
        const parts = parseRes.minDate.split('-');
        const targetYear = parseInt(parts[0], 10);
        const targetMonth = parseInt(parts[1], 10);
        const pad = n => (n < 10 ? '0' + n : '' + n);

        this.setData({
          currentYear: targetYear,
          currentMonth: targetMonth,
          selectedDateStr: parseRes.minDate,
          monthPickerValue: `${targetYear}-${pad(targetMonth)}`,
          viewMode: 'calendar' // 确保处于日历视图
        }, () => {
          // 重新读取并刷新日历与统计数据
          this.loadMonthData();
          wx.showToast({
            title: `日历已更新 (${parseRes.count}条)`,
            icon: 'success',
            duration: 2500
          });
        });
      } else {
        this.loadMonthData();
        wx.showToast({
          title: `日历已更新 (${parseRes.count}条)`,
          icon: 'success',
          duration: 2500
        });
      }
    });
  }
});

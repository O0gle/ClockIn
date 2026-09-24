// pages/settings/settings.js
const attendance = require('../../utils/attendance.js');
const exportUtil = require('../../utils/export.js');
const importUtil = require('../../utils/import.js');

Page({
  data: {
    settings: {
      baseStartTime: '08:30',
      startFlexMinutes: 30,
      baseEndTime: '18:00',
      endFlexMinutes: 30,
      lunchStart: '11:40',
      lunchEnd: '13:40',
      weekdayRestMinutes: 60,
      standardWorkMinutes: 450
    },

    // 弹性区间选择项
    flexOptions: [15, 30, 45, 60],
    flexOptionsLabels: ['±15 分钟', '±30 分钟 (默认)', '±45 分钟', '±60 分钟'],
    startFlexIndex: 1,
    endFlexIndex: 1,

    // 工作日下班休息时长选项
    restOptions: [30, 45, 60, 90],
    restOptionsLabels: ['休息 30 分钟', '休息 45 分钟', '休息 60 分钟 (默认1小时)', '休息 90 分钟 (1.5小时)'],
    restIndex: 2,

    // 动态计算的辅助说明
    flexStartRangeText: '08:00 ~ 09:00',
    flexEndRangeText: '17:30 ~ 18:30',
    lunchDurationText: '2小时0分钟',
    standardWorkText: '7.5 小时',
    weekdayOvertimeRuleText: '下班休息 60 分钟后起算',
    weekendOvertimeRuleText: '全天计加班，中午晚上休息全计入'
  },

  onLoad() {
    this.loadSettings();
  },

  onShow() {
    this.loadSettings();
  },

  loadSettings() {
    const settings = attendance.getSettings();
    const flexOptions = this.data.flexOptions;
    const restOptions = this.data.restOptions;

    let startFlexIndex = flexOptions.indexOf(settings.startFlexMinutes);
    if (startFlexIndex === -1) startFlexIndex = 1;

    let endFlexIndex = flexOptions.indexOf(settings.endFlexMinutes);
    if (endFlexIndex === -1) endFlexIndex = 1;

    let restIndex = restOptions.indexOf(settings.weekdayRestMinutes || 60);
    if (restIndex === -1) restIndex = 2;

    this.setData({
      settings,
      startFlexIndex,
      endFlexIndex,
      restIndex
    });

    this.recalcSummary(settings);
  },

  recalcSummary(settings) {
    const baseStartMins = attendance.timeStrToMinutes(settings.baseStartTime);
    const startEarly = attendance.minutesToTimeStr(baseStartMins - settings.startFlexMinutes);
    const startLate = attendance.minutesToTimeStr(baseStartMins + settings.startFlexMinutes);
    const flexStartRangeText = `${startEarly} ~ ${startLate}`;

    const baseEndMins = attendance.timeStrToMinutes(settings.baseEndTime);
    const endEarly = attendance.minutesToTimeStr(baseEndMins - settings.endFlexMinutes);
    const endLate = attendance.minutesToTimeStr(baseEndMins + settings.endFlexMinutes);
    const flexEndRangeText = `${endEarly} ~ ${endLate}`;

    const lunchStartMins = attendance.timeStrToMinutes(settings.lunchStart);
    const lunchEndMins = attendance.timeStrToMinutes(settings.lunchEnd);
    const lunchBreakMins = Math.max(0, lunchEndMins - lunchStartMins);
    const lunchDurationText = attendance.formatDuration(lunchBreakMins);

    const grossMins = Math.max(0, baseEndMins - baseStartMins);
    const standardWorkMins = Math.max(0, grossMins - lunchBreakMins);
    const standardWorkText = `${attendance.formatHoursDecimal(standardWorkMins)} 小时 (${attendance.formatDuration(standardWorkMins)})`;

    const restMins = settings.weekdayRestMinutes || 60;
    const weekdayOvertimeRuleText = `下班后休息 ${restMins} 分钟起计`;
    const weekendOvertimeRuleText = `全天计加班，中午及晚上休息均全额计入`;

    this.setData({
      flexStartRangeText,
      flexEndRangeText,
      lunchDurationText,
      standardWorkText,
      weekdayOvertimeRuleText,
      weekendOvertimeRuleText
    });
  },

  // 1. 修改上班基准时间
  onBaseStartTimeChange(e) {
    const val = e.detail.value;
    const settings = Object.assign({}, this.data.settings, { baseStartTime: val });
    this.updateAndSave(settings);
  },

  // 2. 修改上班弹性时长
  onStartFlexChange(e) {
    const idx = Number(e.detail.value);
    const mins = this.data.flexOptions[idx];
    const settings = Object.assign({}, this.data.settings, { startFlexMinutes: mins });
    this.setData({ startFlexIndex: idx });
    this.updateAndSave(settings);
  },

  // 3. 修改下班基准时间
  onBaseEndTimeChange(e) {
    const val = e.detail.value;
    const settings = Object.assign({}, this.data.settings, { baseEndTime: val });
    this.updateAndSave(settings);
  },

  // 4. 修改下班弹性时长
  onEndFlexChange(e) {
    const idx = Number(e.detail.value);
    const mins = this.data.flexOptions[idx];
    const settings = Object.assign({}, this.data.settings, { endFlexMinutes: mins });
    this.setData({ endFlexIndex: idx });
    this.updateAndSave(settings);
  },

  // 5. 修改午休开始时间
  onLunchStartChange(e) {
    const val = e.detail.value;
    const settings = Object.assign({}, this.data.settings, { lunchStart: val });
    this.updateAndSave(settings);
  },

  // 6. 修改午休结束时间
  onLunchEndChange(e) {
    const val = e.detail.value;
    const settings = Object.assign({}, this.data.settings, { lunchEnd: val });
    this.updateAndSave(settings);
  },

  // 7. 修改工作日下班休息时长
  onWeekdayRestChange(e) {
    const idx = Number(e.detail.value);
    const mins = this.data.restOptions[idx];
    const settings = Object.assign({}, this.data.settings, { weekdayRestMinutes: mins });
    this.setData({ restIndex: idx });
    this.updateAndSave(settings);
  },

  updateAndSave(settings) {
    const baseStartMins = attendance.timeStrToMinutes(settings.baseStartTime);
    const baseEndMins = attendance.timeStrToMinutes(settings.baseEndTime);
    const lunchStartMins = attendance.timeStrToMinutes(settings.lunchStart);
    const lunchEndMins = attendance.timeStrToMinutes(settings.lunchEnd);
    const lunchBreakMins = Math.max(0, lunchEndMins - lunchStartMins);
    settings.standardWorkMinutes = Math.max(0, (baseEndMins - baseStartMins) - lunchBreakMins);

    attendance.saveSettings(settings);
    this.setData({ settings });
    this.recalcSummary(settings);

    wx.showToast({
      title: '设置已保存',
      icon: 'success',
      duration: 1200
    });
  },

  /**
   * 设置页：导出全部所有月份的考勤报表 (全量导出所有历史内容)
   */
  exportCsvReport() {
    const allRecords = attendance.getAllRecords();
    const allDates = Object.keys(allRecords);

    if (allDates.length === 0) {
      wx.showToast({ title: '本地暂无打卡数据', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在导出全部报表...' });
    exportUtil.exportExcelFile({ allMonths: true }, (err) => {
      if (err) {
        wx.showModal({
          title: '导出遇到问题',
          content: err.message || '请确认存储权限',
          showCancel: false,
          confirmColor: '#1677ff'
        });
      }
    });
  },

  /**
   * 调起微信聊天文件选择器，直接导入并更新日历 (无任何阻断弹窗)
   */
  handleImportExcel() {
    const { settings } = this.data;

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

      // 直接合并入库，不弹对话框打断！
      const currentRecords = attendance.getAllRecords();
      Object.assign(currentRecords, parseRes.records);
      attendance.saveAllRecords(currentRecords);

      // 记录导入的目标年月，通知明细页面自动更新日历
      if (parseRes.minDate) {
        const parts = parseRes.minDate.split('-');
        wx.setStorageSync('records_view_target_month', {
          year: parseInt(parts[0], 10),
          month: parseInt(parts[1], 10),
          date: parseRes.minDate,
          count: parseRes.count
        });
      }

      // 直接切换到明细页面，日历直接刷新出来！
      wx.switchTab({
        url: '/pages/records/records'
      });
    });
  },

  /**
   * 清空所有打卡记录
   */
  clearAllRecords() {
    wx.showModal({
      title: '⚠️ 危险操作',
      content: '确定要清空所有的打卡与考勤记录吗？清空后数据无法恢复！',
      confirmText: '清空全部',
      confirmColor: '#dc2626',
      success: (res) => {
        if (res.confirm) {
          attendance.saveAllRecords({});
          wx.showToast({
            title: '已清空打卡记录',
            icon: 'success'
          });
        }
      }
    });
  }
});

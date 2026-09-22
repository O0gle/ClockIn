// pages/settings/settings.js
const attendance = require('../../utils/attendance.js');

Page({
  data: {
    settings: {
      baseStartTime: '08:30',
      startFlexMinutes: 30,
      baseEndTime: '18:00',
      endFlexMinutes: 30,
      lunchStart: '11:40',
      lunchEnd: '13:40',
      overtimeStart: '19:00',
      standardWorkMinutes: 450
    },

    // 弹性区间选择项
    flexOptions: [15, 30, 45, 60],
    flexOptionsLabels: ['±15 分钟', '±30 分钟 (默认)', '±45 分钟', '±60 分钟'],
    startFlexIndex: 1,
    endFlexIndex: 1,

    // 动态计算的辅助说明
    flexStartRangeText: '08:00 ~ 09:00',
    flexEndRangeText: '17:30 ~ 18:30',
    lunchDurationText: '2小时0分钟',
    standardWorkText: '7.5 小时'
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

    let startFlexIndex = flexOptions.indexOf(settings.startFlexMinutes);
    if (startFlexIndex === -1) startFlexIndex = 1;

    let endFlexIndex = flexOptions.indexOf(settings.endFlexMinutes);
    if (endFlexIndex === -1) endFlexIndex = 1;

    this.setData({
      settings,
      startFlexIndex,
      endFlexIndex
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

    // 标准工时 = (下班基准 - 上班基准) - 午休时长
    const grossMins = Math.max(0, baseEndMins - baseStartMins);
    const standardWorkMins = Math.max(0, grossMins - lunchBreakMins);
    const standardWorkText = `${attendance.formatHoursDecimal(standardWorkMins)} 小时 (${attendance.formatDuration(standardWorkMins)})`;

    this.setData({
      flexStartRangeText,
      flexEndRangeText,
      lunchDurationText,
      standardWorkText
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

  // 7. 修改加班起算时间
  onOvertimeStartChange(e) {
    const val = e.detail.value;
    const settings = Object.assign({}, this.data.settings, { overtimeStart: val });
    this.updateAndSave(settings);
  },

  updateAndSave(settings) {
    // 重新计算标准工时
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
   * 恢复默认规则
   */
  resetToDefault() {
    wx.showModal({
      title: '恢复默认规则',
      content: '确定要恢复为预设规则吗？\n（08:30±30m上班，18:00±30m下班，11:40~13:40午休，19:00起计加班）',
      confirmColor: '#1677ff',
      success: (res) => {
        if (res.confirm) {
          const defaults = Object.assign({}, attendance.DEFAULT_SETTINGS);
          attendance.saveSettings(defaults);
          this.loadSettings();
          wx.showToast({
            title: '已恢复默认',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 加载演示数据 (方便立即体验日历与统计)
   */
  loadDemoData() {
    wx.showModal({
      title: '导入演示示例数据？',
      content: '将为当前月份生成若干条标准的打卡示例记录（含正常弹性、不同下班点与19:00起计加班），方便您预览明细和统计报表。',
      confirmColor: '#1677ff',
      success: (res) => {
        if (res.confirm) {
          this.generateDemoRecords();
        }
      }
    });
  },

  generateDemoRecords() {
    const settings = attendance.getSettings();
    const records = attendance.getAllRecords();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const pad = n => (n < 10 ? '0' + n : '' + n);

    // 生成几个代表性工作日的示例
    const demoSamples = [
      { day: 1, inTime: '08:00', outTime: '17:30', remark: '早到打卡，17:30满7.5h下班' },
      { day: 2, inTime: '08:15', outTime: '17:45', remark: '弹性打卡，满工时下班' },
      { day: 3, inTime: '08:30', outTime: '18:00', remark: '基准时间打卡' },
      { day: 4, inTime: '08:45', outTime: '19:45', remark: '晚上加班45分钟 (从19:00起)' },
      { day: 5, inTime: '08:20', outTime: '20:30', remark: '晚上加班1.5小时 (从19:00起)' },
      { day: 8, inTime: '09:00', outTime: '18:30', remark: '弹性最晚09:00，18:30下班' },
      { day: 9, inTime: '08:25', outTime: '21:00', remark: '突发项目上线，加班2小时' }
    ];

    demoSamples.forEach(item => {
      const dateStr = `${year}-${pad(month)}-${pad(item.day)}`;
      const rec = {
        date: dateStr,
        signInTime: item.inTime,
        signOutTime: item.outTime,
        remark: item.remark
      };
      records[dateStr] = attendance.evaluateRecord(rec, settings);
    });

    attendance.saveAllRecords(records);

    wx.showModal({
      title: '导入成功 🎉',
      content: '已成功生成7条典型考勤与加班示例数据，快去「明细」或「打卡」页面查看日历与统计吧！',
      showCancel: false,
      confirmText: '去查看',
      confirmColor: '#1677ff',
      success: () => {
        wx.switchTab({
          url: '/pages/records/records'
        });
      }
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
  },

  /**
   * 导出全部数据为 JSON 文本并复制到剪贴板
   */
  exportBackupData() {
    const records = attendance.getAllRecords();
    const settings = attendance.getSettings();
    const backup = {
      exportDate: new Date().toISOString(),
      settings,
      records
    };
    const jsonStr = JSON.stringify(backup, null, 2);

    wx.setClipboardData({
      data: jsonStr,
      success: () => {
        wx.showModal({
          title: '备份成功',
          content: '全部考勤配置与打卡数据已复制到剪贴板，可妥善粘贴保存在备忘录或文件中！',
          showCancel: false,
          confirmColor: '#1677ff'
        });
      }
    });
  }
});

// pages/settings/settings.js
const attendance = require('../../utils/attendance.js');
const emailUtil = require('../../utils/email.js');

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

    // 邮箱配置
    emailConfig: {
      targetEmail: '',
      accessKey: ''
    },
    showEmailModal: false,

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
    this.loadEmailConfig();
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

  loadEmailConfig() {
    const emailConfig = emailUtil.getEmailConfig();
    this.setData({ emailConfig });
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
   * 恢复默认规则
   */
  resetToDefault() {
    wx.showModal({
      title: '恢复默认规则',
      content: '确定要恢复为预设规则吗？\n（08:30±30m上班，18:00±30m下班，11:40~13:40午休；工作日下班休息1h起算加班，周末休息全计入加班）',
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
   * 邮箱配置弹窗
   */
  openEmailModal() {
    this.setData({ showEmailModal: true });
  },

  closeEmailModal() {
    this.setData({ showEmailModal: false });
  },

  onTargetEmailInput(e) {
    this.setData({ 'emailConfig.targetEmail': e.detail.value.trim() });
  },

  onAccessKeyInput(e) {
    this.setData({ 'emailConfig.accessKey': e.detail.value.trim() });
  },

  saveEmailConfigOnly() {
    const { emailConfig } = this.data;
    if (!emailConfig.targetEmail) {
      wx.showToast({ title: '请输入邮箱地址', icon: 'none' });
      return;
    }
    emailUtil.saveEmailConfig(emailConfig);
    this.setData({ showEmailModal: false });
    wx.showToast({ title: '邮箱设置已保存', icon: 'success' });
  },

  /**
   * 一键发送当前月考勤与加班明细到邮箱
   */
  triggerSendEmail() {
    const { emailConfig, settings } = this.data;
    if (!emailConfig.targetEmail) {
      this.openEmailModal();
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const stats = attendance.getMonthStatistics(year, month, settings);
    const allRecords = attendance.getAllRecords();

    // 如果还没有设置 Web3Forms Key，提供两种便捷路径
    if (!emailConfig.accessKey) {
      wx.showActionSheet({
        itemList: ['获取免费 Key 并自动直发到邮箱', '复制完整邮件文本 (可直接粘贴发信)', '导出 Excel/CSV 报表文件并发送'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.openEmailModal();
          } else if (res.tapIndex === 1) {
            const body = emailUtil.generateEmailText(year, month, stats, settings, allRecords);
            wx.setClipboardData({
              data: body,
              success: () => {
                wx.showModal({
                  title: '邮件文本已复制 🎉',
                  content: '已成功复制完整的邮件排版文本，包含考勤汇总、每日明细与数据备份，您可以直接粘贴到邮件客户端发送至 ' + emailConfig.targetEmail,
                  showCancel: false,
                  confirmColor: '#1677ff'
                });
              }
            });
          } else if (res.tapIndex === 2) {
            this.exportCsvReport();
          }
        }
      });
      return;
    }

    const body = emailUtil.generateEmailText(year, month, stats, settings, allRecords);
    const subject = `【弹性考勤助手】${year}年${month}月 考勤与加班明细报表`;

    emailUtil.sendEmailViaApi({
      targetEmail: emailConfig.targetEmail,
      accessKey: emailConfig.accessKey,
      subject,
      message: body
    }, (err) => {
      if (err) {
        wx.showModal({
          title: '发送遇到问题',
          content: err.message + '\n\n建议您可点击「复制完整邮件文本」或「导出Excel」直接发送至邮箱！',
          confirmText: '复制文本',
          cancelText: '知道了',
          confirmColor: '#1677ff',
          success: (mRes) => {
            if (mRes.confirm) {
              wx.setClipboardData({ data: body });
            }
          }
        });
      } else {
        wx.showModal({
          title: '邮件发送成功 📬',
          content: `考勤报表已成功发送至您的邮箱：\n${emailConfig.targetEmail}\n请稍后查收收件箱（或垃圾邮件箱）！`,
          showCancel: false,
          confirmColor: '#1677ff'
        });
      }
    });
  },

  /**
   * 生成并导出 Excel / CSV 报表文件
   */
  exportCsvReport() {
    const { settings } = this.data;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const stats = attendance.getMonthStatistics(year, month, settings);

    wx.showLoading({ title: '正在生成表格...' });
    emailUtil.exportCsvFile(year, month, stats, (err) => {
      wx.hideLoading();
      if (err) {
        wx.showToast({ title: '文件生成失败', icon: 'none' });
      }
    });
  },

  /**
   * 加载演示数据
   */
  loadDemoData() {
    wx.showModal({
      title: '导入演示示例数据？',
      content: '将为当前月份生成若干条打卡示例（含工作日弹性打卡、下班休息1h后起算加班，以及周六周日中午晚上休息全额计入加班的样例）。',
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

    let satDay = null;
    let sunDay = null;
    const totalDays = new Date(year, month, 0).getDate();
    for (let d = 1; d <= totalDays; d++) {
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      if (dayOfWeek === 6 && !satDay) satDay = d;
      if (dayOfWeek === 0 && !sunDay) sunDay = d;
      if (satDay && sunDay) break;
    }

    const weekdays = [];
    for (let d = 1; d <= totalDays; d++) {
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        weekdays.push(d);
        if (weekdays.length >= 5) break;
      }
    }

    const demoSamples = [];

    if (weekdays[0]) demoSamples.push({ day: weekdays[0], inTime: '08:00', outTime: '17:30', remark: '工作日早到，17:30满7.5h正常下班' });
    if (weekdays[1]) demoSamples.push({ day: weekdays[1], inTime: '08:15', outTime: '20:15', remark: '工作日弹性，17:45下班休息1h至18:45，加班1.5h' });
    if (weekdays[2]) demoSamples.push({ day: weekdays[2], inTime: '08:30', outTime: '18:00', remark: '工作日基准打卡，准时下班' });
    if (weekdays[3]) demoSamples.push({ day: weekdays[3], inTime: '08:30', outTime: '20:30', remark: '工作日18:00下班休息至19:00，加班1.5h' });
    if (weekdays[4]) demoSamples.push({ day: weekdays[4], inTime: '09:00', outTime: '18:30', remark: '工作日弹性最晚，18:30满工时下班' });

    if (satDay) demoSamples.push({ day: satDay, inTime: '09:00', outTime: '18:00', remark: '周六加班9小时 (中午休息时间计入加班)' });
    if (sunDay) demoSamples.push({ day: sunDay, inTime: '08:30', outTime: '20:30', remark: '周日加班12小时 (中午与晚上休息均计入加班)' });

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
      content: `已成功生成 ${demoSamples.length} 条考勤示例（包含工作日休息1h起算加班、周六日全额计加班样例），快去「明细」或「打卡」查看吧！`,
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
   * 导出全部数据为 JSON
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
          content: '全部考勤配置与打卡数据已复制到剪贴板！',
          showCancel: false,
          confirmColor: '#1677ff'
        });
      }
    });
  }
});

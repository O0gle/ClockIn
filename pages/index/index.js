// pages/index/index.js
const attendance = require('../../utils/attendance.js');

Page({
  data: {
    // 实时时钟
    currentDateText: '',
    weekDayText: '',
    currentTimeText: '',

    // 今日记录
    todayDate: '',
    record: null,

    // 考勤规则
    settings: null,

    // 工作状态推算
    workState: 'unpunched', // 'unpunched' | 'working' | 'off_work' | 'overtime'
    workStateText: '今日尚未打卡',

    // 动态进度与提示
    elapsedWorkText: '',     // 已在岗/已工作时长
    remainingWorkText: '',   // 距预计下班还需
    overtimeActiveText: '',  // 当前加班时长

    // 补卡/修改弹窗
    showEditModal: false,
    editSignInTime: '',
    editSignOutTime: '',
    editRemark: '',

    // 规则折叠说明
    showRuleDetail: false
  },

  timer: null,

  onLoad() {
    this.initPage();
  },

  onShow() {
    this.refreshData();
    this.startClock();
  },

  onHide() {
    this.stopClock();
  },

  onUnload() {
    this.stopClock();
  },

  onPullDownRefresh() {
    this.refreshData();
    wx.stopPullDownRefresh();
    wx.showToast({
      title: '已刷新',
      icon: 'none'
    });
  },

  initPage() {
    this.refreshData();
    this.startClock();
  },

  /**
   * 刷新今日数据和设置
   */
  refreshData() {
    const today = attendance.getTodayDateStr();
    const settings = attendance.getSettings();
    const record = attendance.getRecordByDate(today, settings);

    this.setData({
      todayDate: today,
      settings,
      record
    });

    this.updateWorkStatus();
  },

  /**
   * 启动实时时钟 (每秒刷新一次，精确显示当前时间和倒计时)
   */
  startClock() {
    this.stopClock();
    this.updateClock();
    this.timer = setInterval(() => {
      this.updateClock();
    }, 1000);
  },

  stopClock() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  /**
   * 更新当前时钟与动态计算状态
   */
  updateClock() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const pad = n => (n < 10 ? '0' + n : '' + n);
    const currentTimeText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    // 日期文本
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekDayText = weekDays[now.getDay()];
    const currentDateText = `${year}年${month}月${date}日`;

    this.setData({
      currentTimeText,
      currentDateText,
      weekDayText
    });

    // 每一分钟更新一次在岗倒计时或加班实时显示
    if (seconds === 0 || !this.data.elapsedWorkText) {
      this.updateWorkStatus();
    }
  },

  /**
   * 根据当前打卡情况与当前时间，计算工作状态
   */
  updateWorkStatus() {
    const { record, settings } = this.data;
    if (!record || !settings) return;

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const nowTimeStr = attendance.getCurrentTimeStr(now);

    let workState = 'unpunched';
    let workStateText = '今日尚未打卡';
    let elapsedWorkText = '';
    let remainingWorkText = '';
    let overtimeActiveText = '';

    if (!record.signInTime && !record.signOutTime) {
      // 未打卡
      workState = 'unpunched';
      workStateText = '今日尚未打卡';
    } else if (record.signInTime && !record.signOutTime) {
      // 工作中
      const expectedOutMins = record.expectedOutMins;
      const currentWorkMins = attendance.calculateWorkDuration(record.signInTime, nowTimeStr, settings);
      elapsedWorkText = attendance.formatDuration(currentWorkMins);

      const overtimeStartMins = attendance.timeStrToMinutes(settings.overtimeStart); // 19:00 (1140)

      if (nowMins >= overtimeStartMins) {
        // 当前已经在加班时间 (>= 19:00)
        workState = 'overtime';
        const currentOvertimeMins = nowMins - overtimeStartMins;
        overtimeActiveText = attendance.formatDuration(currentOvertimeMins);
        workStateText = `加班进行中 (从${settings.overtimeStart}已加 ${overtimeActiveText})`;
      } else if (expectedOutMins && nowMins >= expectedOutMins) {
        // 已经满7.5小时工时，尚未到19:00
        workState = 'working';
        workStateText = '已满标准工时，可随时打卡下班';
        remainingWorkText = '已达标';
      } else {
        // 正常工作中，计算倒计时
        workState = 'working';
        workStateText = '正常工作中';
        if (expectedOutMins) {
          const diff = expectedOutMins - nowMins;
          remainingWorkText = diff > 0 ? `距下班还需 ${attendance.formatDuration(diff)}` : '已达标';
        }
      }
    } else {
      // 已经完成下班打卡
      if (record.overtimeMinutes > 0) {
        workState = 'off_work';
        workStateText = `已下班 (加班 ${record.overtimeText})`;
      } else {
        workState = 'off_work';
        workStateText = `已下班 (工时 ${record.workText})`;
      }
    }

    this.setData({
      workState,
      workStateText,
      elapsedWorkText,
      remainingWorkText,
      overtimeActiveText
    });
  },

  /**
   * 上班打卡操作
   */
  handlePunchIn() {
    const now = new Date();
    const timeStr = attendance.getCurrentTimeStr(now);
    const today = attendance.getTodayDateStr(now);
    const { record, settings } = this.data;

    // 震动反馈
    wx.vibrateShort({ type: 'medium' });

    // 检查是否重复打上班卡
    if (record && record.signInTime) {
      wx.showModal({
        title: '更新上班打卡时间？',
        content: `原打卡时间为 ${record.signInTime}，确定要更新为当前时间 ${timeStr} 吗？`,
        confirmColor: '#1677ff',
        success: (res) => {
          if (res.confirm) {
            this.doSavePunchIn(today, timeStr);
          }
        }
      });
      return;
    }

    this.doSavePunchIn(today, timeStr);
  },

  doSavePunchIn(today, timeStr) {
    const { record, settings } = this.data;
    const newRecord = Object.assign({}, record, {
      date: today,
      signInTime: timeStr,
      signInTimestamp: Date.now()
    });

    const evaluated = attendance.saveDailyRecord(newRecord, settings);

    this.setData({
      record: evaluated
    });
    this.updateWorkStatus();

    let tip = `上班打卡成功：${timeStr}`;
    if (evaluated.expectedSignOutTime) {
      tip += `\n预计下班：${evaluated.expectedSignOutTime}`;
    }

    wx.showModal({
      title: '打卡成功 🎉',
      content: tip,
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#1677ff'
    });
  },

  /**
   * 下班打卡操作
   */
  handlePunchOut() {
    const now = new Date();
    const timeStr = attendance.getCurrentTimeStr(now);
    const today = attendance.getTodayDateStr(now);
    const { record, settings } = this.data;

    // 震动反馈
    wx.vibrateShort({ type: 'medium' });

    if (!record || !record.signInTime) {
      wx.showModal({
        title: '未记录上班打卡',
        content: '您今天还未打上班卡，是否直接记录下班打卡？建议先补充上班打卡时间。',
        cancelText: '去补卡',
        confirmText: '直接下班',
        confirmColor: '#1677ff',
        success: (res) => {
          if (res.confirm) {
            this.doSavePunchOut(today, timeStr);
          } else {
            this.openEditModal();
          }
        }
      });
      return;
    }

    // 检查是否早退
    const nowMins = attendance.timeStrToMinutes(timeStr);
    const expectedOutMins = record.expectedOutMins;

    if (expectedOutMins && nowMins < expectedOutMins) {
      const diff = expectedOutMins - nowMins;
      wx.showModal({
        title: '提示：未满标准工时',
        content: `根据您的上班打卡(${record.signInTime})与弹性7.5h制，预计需满 ${record.expectedSignOutTime} 下班。\n此时打卡将早退 ${diff} 分钟，确定下班吗？`,
        confirmText: '确认打卡',
        cancelText: '继续上班',
        confirmColor: '#d97706',
        success: (res) => {
          if (res.confirm) {
            this.doSavePunchOut(today, timeStr);
          }
        }
      });
      return;
    }

    // 如果已经打过下班卡，询问是否更新 (例如加班到更晚)
    if (record.signOutTime) {
      wx.showModal({
        title: '更新下班打卡时间？',
        content: `原下班时间为 ${record.signOutTime}，确定更新为当前时间 ${timeStr} 吗？`,
        confirmColor: '#1677ff',
        success: (res) => {
          if (res.confirm) {
            this.doSavePunchOut(today, timeStr);
          }
        }
      });
      return;
    }

    this.doSavePunchOut(today, timeStr);
  },

  doSavePunchOut(today, timeStr) {
    const { record, settings } = this.data;
    const newRecord = Object.assign({}, record, {
      date: today,
      signOutTime: timeStr,
      signOutTimestamp: Date.now()
    });

    const evaluated = attendance.saveDailyRecord(newRecord, settings);

    this.setData({
      record: evaluated
    });
    this.updateWorkStatus();

    let content = `下班打卡成功：${timeStr}\n今日工作工时：${evaluated.workText}`;
    if (evaluated.overtimeMinutes > 0) {
      content += `\n🌟 记录加班：${evaluated.overtimeText} (从${settings.overtimeStart}起算)`;
    }

    wx.showModal({
      title: evaluated.overtimeMinutes > 0 ? '辛苦了！加班已记录 👏' : '辛苦了，打卡成功 ✨',
      content,
      showCancel: false,
      confirmText: '完成',
      confirmColor: '#1677ff'
    });
  },

  /**
   * 打开补卡/手动编辑弹窗
   */
  openEditModal() {
    const { record } = this.data;
    this.setData({
      showEditModal: true,
      editSignInTime: record && record.signInTime ? record.signInTime : '08:30',
      editSignOutTime: record && record.signOutTime ? record.signOutTime : '',
      editRemark: record && record.remark ? record.remark : ''
    });
  },

  closeEditModal() {
    this.setData({
      showEditModal: false
    });
  },

  onEditSignInChange(e) {
    this.setData({
      editSignInTime: e.detail.value
    });
  },

  onEditSignOutChange(e) {
    this.setData({
      editSignOutTime: e.detail.value
    });
  },

  onEditRemarkChange(e) {
    this.setData({
      editRemark: e.detail.value
    });
  },

  saveEditRecord() {
    const { todayDate, editSignInTime, editSignOutTime, editRemark, record, settings } = this.data;

    if (!editSignInTime && !editSignOutTime) {
      wx.showToast({
        title: '请至少填写上班或下班时间',
        icon: 'none'
      });
      return;
    }

    const updated = Object.assign({}, record, {
      date: todayDate,
      signInTime: editSignInTime || '',
      signOutTime: editSignOutTime || '',
      remark: editRemark || ''
    });

    const evaluated = attendance.saveDailyRecord(updated, settings);

    this.setData({
      record: evaluated,
      showEditModal: false
    });
    this.updateWorkStatus();

    wx.showToast({
      title: '修改成功',
      icon: 'success'
    });
  },

  toggleRuleDetail() {
    this.setData({
      showRuleDetail: !this.data.showRuleDetail
    });
  },

  goToRecords() {
    wx.switchTab({
      url: '/pages/records/records'
    });
  }
});

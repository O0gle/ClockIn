// pages/index/index.js
const attendance = require('../../utils/attendance.js');

Page({
  data: {
    // 实时时钟
    currentDateText: '',
    weekDayText: '',
    currentTimeText: '',
    isWeekend: false,

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

    // 长按5秒更新下班打卡状态
    isPressing: false,
    pressPercent: 0,
    pressRemaining: 5,

    // 规则折叠说明
    showRuleDetail: false
  },

  timer: null,
  pressTimer: null,
  longPressDetectTimer: null,
  pressStartTime: 0,
  hasTriggeredLongPress: false,

  onLoad() {
    this.initPage();
  },

  onShow() {
    this.refreshData();
    this.startClock();
  },

  onHide() {
    this.stopClock();
    this.clearPressTimer();
  },

  onUnload() {
    this.stopClock();
    this.clearPressTimer();
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
    const isWeekend = attendance.isWeekendDate(today);

    this.setData({
      todayDate: today,
      isWeekend,
      settings,
      record
    });

    this.updateWorkStatus();
  },

  /**
   * 启动实时时钟
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
    const dayOfWeek = now.getDay();
    const weekDayText = weekDays[dayOfWeek];
    const currentDateText = `${year}年${month}月${date}日`;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    this.setData({
      currentTimeText,
      currentDateText,
      weekDayText,
      isWeekend
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
    const { record, settings, isWeekend } = this.data;
    if (!record || !settings) return;

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const nowTimeStr = attendance.getCurrentTimeStr(now);

    let workState = 'unpunched';
    let workStateText = isWeekend ? '周末尚未打卡' : '今日尚未打卡';
    let elapsedWorkText = '';
    let remainingWorkText = '';
    let overtimeActiveText = '';

    if (!record.signInTime && !record.signOutTime) {
      // 未打卡
      workState = 'unpunched';
      if (attendance.isRestrictedPunchTime(now)) {
        workStateText = '凌晨休息时段 (07:00开放打卡)';
      } else {
        workStateText = isWeekend ? '周末尚未打卡 (全天计加班)' : '今日尚未打卡';
      }
    } else if (record.signInTime && !record.signOutTime) {
      // 工作中
      const inMins = attendance.timeStrToMinutes(record.signInTime);

      if (isWeekend) {
        // 周末：把中午、晚上的休息时间都计入加班时长
        workState = 'overtime';
        const weekendOtMins = Math.max(0, nowMins - inMins);
        overtimeActiveText = attendance.formatDuration(weekendOtMins);
        elapsedWorkText = overtimeActiveText;
        workStateText = `周末加班进行中 (已加 ${overtimeActiveText}，休息全计)`;
        remainingWorkText = '全天计加班';
      } else {
        // 工作日：满7.5h后休息1小时起算加班
        const expectedOutMins = record.expectedOutMins;
        const currentWorkMins = attendance.calculateWorkDuration(record.signInTime, nowTimeStr, settings, record.date);
        elapsedWorkText = attendance.formatDuration(currentWorkMins);

        const restMins = settings.weekdayRestMinutes || 60;
        const overtimeStartMins = (expectedOutMins || attendance.timeStrToMinutes(settings.baseEndTime)) + restMins;

        if (nowMins >= overtimeStartMins) {
          // 当前已经在加班时间 (满工时 + 休息1小时 之后)
          workState = 'overtime';
          const currentOvertimeMins = nowMins - overtimeStartMins;
          overtimeActiveText = attendance.formatDuration(currentOvertimeMins);
          const otStartStr = attendance.minutesToTimeStr(overtimeStartMins);
          workStateText = `工作日加班进行中 (休息1h后从${otStartStr}已加 ${overtimeActiveText})`;
          remainingWorkText = '已进入加班';
        } else if (expectedOutMins && nowMins >= expectedOutMins) {
          // 已经满7.5小时工时，处于下班休息1小时内
          workState = 'working';
          const restLeft = overtimeStartMins - nowMins;
          workStateText = `已满标准工时 · 休息缓冲中 (离加班还剩 ${restLeft}分钟)`;
          remainingWorkText = '已达标(休息中)';
        } else {
          // 正常工作中，计算倒计时
          workState = 'working';
          workStateText = '正常工作中';
          if (expectedOutMins) {
            const diff = expectedOutMins - nowMins;
            remainingWorkText = diff > 0 ? `距下班还需 ${attendance.formatDuration(diff)}` : '已达标';
          }
        }
      }
    } else {
      // 已经完成下班打卡
      if (record.overtimeMinutes > 0) {
        workState = 'off_work';
        workStateText = isWeekend ? `周末加班完成 (${record.overtimeText})` : `已下班 (工作日加班 ${record.overtimeText})`;
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
    if (attendance.isRestrictedPunchTime()) {
      wx.vibrateShort({ type: 'medium' });
      wx.showModal({
        title: '暂未开放打卡 🌙',
        content: '系统限制：凌晨 00:00 至 06:59 之间不可打卡，请在 07:00 之后再来打卡。',
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#1677ff'
      });
      return;
    }

    const now = new Date();
    const timeStr = attendance.getCurrentTimeStr(now);
    const today = attendance.getTodayDateStr(now);
    const { record } = this.data;

    wx.vibrateShort({ type: 'medium' });

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
    const { record, settings, isWeekend } = this.data;
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

    let tip = `打卡成功：${timeStr}`;
    if (isWeekend) {
      tip += `\n🌟 今日是周末：全天出勤计加班，中午与晚上休息均计入加班时长！`;
    } else {
      if (evaluated.expectedSignOutTime) {
        tip += `\n预计下班：${evaluated.expectedSignOutTime}\n休息1小时后 (即${evaluated.overtimeStartTime}) 开始计入加班`;
      }
    }

    wx.showModal({
      title: isWeekend ? '周末加班打卡成功 👏' : '上班打卡成功 🎉',
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
    if (attendance.isRestrictedPunchTime()) {
      wx.vibrateShort({ type: 'medium' });
      wx.showModal({
        title: '暂未开放打卡 🌙',
        content: '系统限制：凌晨 00:00 至 06:59 之间不可打卡，请在 07:00 之后再来打卡。',
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#1677ff'
      });
      return;
    }

    const now = new Date();
    const timeStr = attendance.getCurrentTimeStr(now);
    const today = attendance.getTodayDateStr(now);
    const { record, isWeekend } = this.data;

    wx.vibrateShort({ type: 'medium' });

    if (!record || !record.signInTime) {
      wx.showModal({
        title: '未记录上班打卡',
        content: isWeekend ? '您尚未打开始卡，建议先补充上班时间。' : '您今天还未打上班卡，是否直接记录下班？建议先补充上班打卡。',
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

    // 工作日检查是否早退
    if (!isWeekend) {
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
    }

    this.doSavePunchOut(today, timeStr);
  },

  /**
   * 已打下班卡时：按住判断意图 (长按5秒防误触机制)
   */
  handleDoneTouchStart() {
    if (attendance.isRestrictedPunchTime()) {
      wx.vibrateShort({ type: 'medium' });
      wx.showModal({
        title: '暂未开放打卡 🌙',
        content: '系统限制：凌晨 00:00 至 06:59 之间不可打卡，请在 07:00 之后再来打卡。',
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#1677ff'
      });
      return;
    }

    this.pressStartTime = Date.now();
    this.hasTriggeredLongPress = false;
    this.clearPressTimer();

    // 设置 350 毫秒按压缓冲阈值：
    // 如果手指在 350ms 内抬起，判定为普通点按，绝对不进入长按状态与震动！
    // 只有按住超过 350ms，才正式确认长按意图并展示水波纹与倒计时！
    this.longPressDetectTimer = setTimeout(() => {
      this.setData({
        isPressing: true,
        pressPercent: 0,
        pressRemaining: 5
      });

      wx.vibrateShort({ type: 'medium' });

      const totalMs = 5000;
      this.pressTimer = setInterval(() => {
        const elapsed = Date.now() - this.pressStartTime;
        const percent = Math.min(100, Math.floor((elapsed / totalMs) * 100));
        const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));

        if (remaining !== this.data.pressRemaining && remaining > 0) {
          wx.vibrateShort({ type: 'light' });
        }

        this.setData({
          pressPercent: percent,
          pressRemaining: remaining
        });

        if (elapsed >= totalMs) {
          // 满 5 秒，成功解锁！
          this.clearPressTimer();
          this.hasTriggeredLongPress = true;

          this.setData({
            isPressing: false,
            pressPercent: 100,
            pressRemaining: 0
          });

          // 成功长震动反馈
          wx.vibrateLong();

          // 长按满5秒直接更新下班打卡，无需点击任何弹窗对话框
          this.executeDirectUpdateSignOut();
        }
      }, 50);
    }, 350);
  },

  /**
   * 松开按键
   */
  handleDoneTouchEnd() {
    this.clearPressTimer();

    if (this.data.isPressing) {
      this.setData({
        isPressing: false,
        pressPercent: 0,
        pressRemaining: 5
      });
    }
  },

  /**
   * 短按静默拦截 (点按不作任何反应，防误触)
   */
  handleDoneTap() {
    // 纯点按静默防误触，不弹出任何 Toast 提示
  },

  clearPressTimer() {
    if (this.longPressDetectTimer) {
      clearTimeout(this.longPressDetectTimer);
      this.longPressDetectTimer = null;
    }
    if (this.pressTimer) {
      clearInterval(this.pressTimer);
      this.pressTimer = null;
    }
  },

  /**
   * 长按满 5 秒直接执行更新，无任何阻断对话框或提示浮条
   */
  executeDirectUpdateSignOut() {
    const now = new Date();
    const timeStr = attendance.getCurrentTimeStr(now);
    const today = attendance.getTodayDateStr(now);
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
  },

  doSavePunchOut(today, timeStr) {
    const { record, settings, isWeekend } = this.data;
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

    let content = `下班打卡成功：${timeStr}`;
    if (isWeekend) {
      content += `\n🌟 周末累计加班：${evaluated.overtimeText} (中午及晚间休息全额计入)`;
    } else {
      content += `\n今日工作工时：${evaluated.workText}`;
      if (evaluated.overtimeMinutes > 0) {
        content += `\n🌟 工作日加班：${evaluated.overtimeText} (下班后休息1小时后起算)`;
      } else {
        content += `\n(下班后休息1小时内，未产生加班时长)`;
      }
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
    this.setData({ editSignInTime: e.detail.value });
  },

  onEditSignOutChange(e) {
    this.setData({ editSignOutTime: e.detail.value });
  },

  onEditRemarkChange(e) {
    this.setData({ editRemark: e.detail.value });
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

    if ((editSignInTime && attendance.isRestrictedPunchTime(editSignInTime)) || (editSignOutTime && attendance.isRestrictedPunchTime(editSignOutTime))) {
      wx.showToast({
        title: '打卡时间不可设置在凌晨00:00~06:59',
        icon: 'none',
        duration: 2500
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

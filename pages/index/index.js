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

    // 上班打卡长按3秒相关状态
    isInPressing: false,
    inPressPercent: 0,
    inPressRemaining: 3,

    // 长按5秒更新下班打卡状态
    isPressing: false,
    pressPercent: 0,
    pressRemaining: 5,

    // 规则折叠说明
    showRuleDetail: false
  },

  timer: null,
  // 下班长按5秒定时器
  pressTimer: null,
  longPressDetectTimer: null,
  pressStartTime: 0,
  hasTriggeredLongPress: false,
  // 上班长按3秒定时器
  inPressTimer: null,
  inLongPressDetectTimer: null,
  inPressStartTime: 0,
  hasTriggeredInLongPress: false,

  _justLoaded: false,

  onLoad() {
    this.refreshData();
    this._justLoaded = true;
    if (wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline']
      });
    }
  },

  onShow() {
    if (this._justLoaded) {
      this._justLoaded = false;
    } else {
      this.refreshData();
    }
    this.startClock();
  },

  onHide() {
    this.stopClock();
    this.clearPressTimer();
    this.clearInPressTimer();
  },

  onUnload() {
    this.stopClock();
    this.clearPressTimer();
    this.clearInPressTimer();
  },

  onPullDownRefresh() {
    this.refreshData();
    wx.stopPullDownRefresh();
    wx.showToast({
      title: '已刷新',
      icon: 'none'
    });
  },

  /**
   * 单次合并刷新今日数据、设置、时钟与工作状态
   */
  refreshData() {
    const now = new Date();
    const today = attendance.getTodayDateStr(now);
    const settings = attendance.getSettings();
    const record = attendance.getRecordByDate(today, settings);
    const dayInfo = attendance.getDayInfo(today);
    const isWeekend = dayInfo.isOffDay;
    const restDurationText = attendance.formatRestMinutes(settings.weekdayRestMinutes || 60);

    const clockData = this.computeClockData(now);
    const workStatus = this.computeWorkStatus(record, settings, isWeekend, now);

    // 单次合并 setData，彻底杜绝首屏多次重绘造成的卡顿与白屏延迟
    this.setData(Object.assign({
      todayDate: today,
      isWeekend,
      restDurationText,
      dayType: dayInfo.type,
      dayTypeName: dayInfo.name,
      settings,
      record
    }, clockData, workStatus));
  },

  /**
   * 计算日期与当前时钟文本
   */
  computeClockData(now = new Date()) {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const pad = n => (n < 10 ? '0' + n : '' + n);
    const currentTimeText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const dayOfWeek = now.getDay();
    const weekDayText = weekDays[dayOfWeek];
    const currentDateText = `${year}年${month}月${date}日`;

    const todayStr = attendance.getTodayDateStr(now);
    const dayInfo = attendance.getDayInfo(todayStr);
    const isWeekend = dayInfo.isOffDay;
    const ruleTagText = dayInfo.type === 'holiday'
      ? `${dayInfo.name} · 全天计加班`
      : (dayInfo.type === 'workday_makeup'
        ? `${dayInfo.name} · 弹性满7.5h`
        : (isWeekend ? '周末 · 休息全计加班' : '工作日 · 弹性满7.5h'));

    return {
      currentTimeText,
      currentDateText,
      weekDayText,
      isWeekend,
      dayType: dayInfo.type,
      dayTypeName: dayInfo.name,
      holidayBadge: dayInfo.badge,
      ruleTagText
    };
  },

  /**
   * 纯函数：根据打卡情况与时间推算工作状态（不含 setData）
   */
  computeWorkStatus(record, settings, isWeekend, now = new Date()) {
    const dayName = (record && record.dayTypeName) || (isWeekend ? '周末' : '工作日');

    if (!record || !settings) {
      return {
        workState: 'unpunched',
        workStateText: isWeekend ? `${dayName}尚未打卡` : '今日尚未打卡',
        elapsedWorkText: '',
        remainingWorkText: '',
        overtimeActiveText: ''
      };
    }

    const nowMins = now.getHours() * 60 + now.getMinutes();
    const nowTimeStr = attendance.getCurrentTimeStr(now);

    let workState = 'unpunched';
    let workStateText = isWeekend ? `${dayName}尚未打卡` : '今日尚未打卡';
    let elapsedWorkText = '';
    let remainingWorkText = '';
    let overtimeActiveText = '';

    if (!record.signInTime && !record.signOutTime) {
      // 未打卡
      workState = 'unpunched';
      if (attendance.isRestrictedPunchTime(now)) {
        workStateText = '凌晨休息时段 (07:00开放打卡)';
      } else {
        workStateText = isWeekend ? `${dayName}尚未打卡 (全天计加班)` : '今日尚未打卡';
      }
    } else if (record.signInTime && !record.signOutTime) {
      // 工作中
      const inMins = attendance.timeStrToMinutes(record.signInTime);

      if (isWeekend) {
        // 周末及节假日：把中午、晚上的休息时间都计入加班时长
        workState = 'overtime';
        const weekendOtMins = Math.max(0, nowMins - inMins);
        overtimeActiveText = attendance.formatDuration(weekendOtMins);
        elapsedWorkText = overtimeActiveText;
        workStateText = `${dayName}加班进行中 (已加 ${overtimeActiveText}，休息全计)`;
        remainingWorkText = '全天计加班';
      } else {
        // 工作日：满7.5h后休息指定时长(默认1h)起算加班
        const expectedOutMins = record.expectedOutMins;
        const currentWorkMins = attendance.calculateWorkDuration(record.signInTime, nowTimeStr, settings, record.date);
        elapsedWorkText = attendance.formatDuration(currentWorkMins);

        const restMins = settings.weekdayRestMinutes || 60;
        const restText = attendance.formatRestMinutes(restMins);
        const overtimeStartMins = (expectedOutMins || attendance.timeStrToMinutes(settings.baseEndTime)) + restMins;

        if (nowMins >= overtimeStartMins) {
          // 当前已经在加班时间 (满工时 + 休息指定时长 之后)
          workState = 'overtime';
          const currentOvertimeMins = nowMins - overtimeStartMins;
          overtimeActiveText = attendance.formatDuration(currentOvertimeMins);
          const otStartStr = attendance.minutesToTimeStr(overtimeStartMins);
          workStateText = `工作日加班进行中 (休息${restText}后从${otStartStr}已加 ${overtimeActiveText})`;
          remainingWorkText = '已进入加班';
        } else if (expectedOutMins && nowMins >= expectedOutMins) {
          // 已经满7.5小时工时，处于下班休息缓冲期内
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
        workStateText = isWeekend ? `${dayName}加班完成 (${record.overtimeText})` : `已下班 (工作日加班 ${record.overtimeText})`;
      } else {
        workState = 'off_work';
        workStateText = `已下班 (工时 ${record.workText})`;
      }
    }

    return {
      workState,
      workStateText,
      elapsedWorkText,
      remainingWorkText,
      overtimeActiveText
    };
  },

  /**
   * 启动实时时钟
   */
  startClock() {
    this.stopClock();
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
   * 更新当前时钟与动态计算状态（轻量级，按需触发）
   */
  updateClock() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const pad = n => (n < 10 ? '0' + n : '' + n);
    const currentTimeText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    // 每秒仅更新时钟文本，极大降低 JSBridge 跨线程传输消耗
    const patch = { currentTimeText };

    // 跨分钟整点更新工作状态倒计时与时长推算
    if (seconds === 0) {
      // 跨午夜00:00:00时整天变更，全量刷新今日数据与考勤记录
      if (hours === 0 && minutes === 0) {
        this.refreshData();
        return;
      }
      const { record, settings, isWeekend } = this.data;
      if (record && settings) {
        Object.assign(patch, this.computeWorkStatus(record, settings, isWeekend, now));
      }
    }

    this.setData(patch);
  },

  /**
   * 单独更新工作状态
   */
  updateWorkStatus() {
    const { record, settings, isWeekend } = this.data;
    if (!record || !settings) return;
    const now = new Date();
    this.setData(this.computeWorkStatus(record, settings, isWeekend, now));
  },

  /**
   * 上班打卡：长按 3 秒判定与倒计时 (长按3秒生效，防误触)
   */
  handleInTouchStart() {
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

    this.inPressStartTime = Date.now();
    this.hasTriggeredInLongPress = false;
    this.clearInPressTimer();

    // 300 毫秒按压意图识别缓冲区：若 300ms 内抬起则判定为误触/点按，不进入长按
    this.inLongPressDetectTimer = setTimeout(() => {
      this.setData({
        isInPressing: true,
        inPressPercent: 0,
        inPressRemaining: 3
      });

      wx.vibrateShort({ type: 'medium' });

      const totalMs = 3000; // 3 秒
      this.inPressTimer = setInterval(() => {
        const elapsed = Date.now() - this.inPressStartTime;
        const percent = Math.min(100, Math.floor((elapsed / totalMs) * 100));
        const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));

        if (remaining !== this.data.inPressRemaining && remaining > 0) {
          wx.vibrateShort({ type: 'light' });
        }

        this.setData({
          inPressPercent: percent,
          inPressRemaining: remaining
        });

        if (elapsed >= totalMs) {
          // 满 3 秒，成功打卡！
          this.clearInPressTimer();
          this.hasTriggeredInLongPress = true;

          this.setData({
            isInPressing: false,
            inPressPercent: 100,
            inPressRemaining: 0
          });

          // 成功长震动反馈
          wx.vibrateLong();

          // 直接打卡生效，彻底删除弹出的对话框！
          const now = new Date();
          const timeStr = attendance.getCurrentTimeStr(now);
          const today = attendance.getTodayDateStr(now);
          this.doSavePunchIn(today, timeStr);
        }
      }, 50);
    }, 300);
  },

  handleInTouchEnd() {
    this.clearInPressTimer();
    if (this.data.isInPressing) {
      this.setData({
        isInPressing: false,
        inPressPercent: 0,
        inPressRemaining: 3
      });
    }
  },

  handleInTap() {
    // 短按静默拦截，防误触，不作任何反应
  },

  clearInPressTimer() {
    if (this.inLongPressDetectTimer) {
      clearTimeout(this.inLongPressDetectTimer);
      this.inLongPressDetectTimer = null;
    }
    if (this.inPressTimer) {
      clearInterval(this.inPressTimer);
      this.inPressTimer = null;
    }
  },

  doSavePunchIn(today, timeStr) {
    const { record, settings, isWeekend } = this.data;
    const newRecord = Object.assign({}, record, {
      date: today,
      signInTime: timeStr,
      signInTimestamp: Date.now()
    });

    const evaluated = attendance.saveDailyRecord(newRecord, settings);
    const now = new Date();
    const workStatus = this.computeWorkStatus(evaluated, settings, isWeekend, now);

    this.setData(Object.assign({
      record: evaluated
    }, workStatus));

    // 生效后弹出的对话框已彻底删除！0 弹窗打扰直接生效！
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
    const { record, settings, isWeekend } = this.data;

    const newRecord = Object.assign({}, record, {
      date: today,
      signOutTime: timeStr,
      signOutTimestamp: Date.now()
    });

    const evaluated = attendance.saveDailyRecord(newRecord, settings);
    const workStatus = this.computeWorkStatus(evaluated, settings, isWeekend, now);

    this.setData(Object.assign({
      record: evaluated
    }, workStatus));
  },

  doSavePunchOut(today, timeStr) {
    const { record, settings, isWeekend } = this.data;
    const newRecord = Object.assign({}, record, {
      date: today,
      signOutTime: timeStr,
      signOutTimestamp: Date.now()
    });

    const evaluated = attendance.saveDailyRecord(newRecord, settings);
    const now = new Date();
    const workStatus = this.computeWorkStatus(evaluated, settings, isWeekend, now);

    this.setData(Object.assign({
      record: evaluated
    }, workStatus));

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
    const now = new Date();
    const workStatus = this.computeWorkStatus(evaluated, settings, this.data.isWeekend, now);

    this.setData(Object.assign({
      record: evaluated,
      showEditModal: false
    }, workStatus));

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
  },

  onShareAppMessage() {
    return {
      title: '弹性打卡助手 - 专注弹性工时推算与考勤加班计算',
      path: '/pages/index/index'
    };
  },

  onShareTimeline() {
    return {
      title: '弹性打卡助手 - 专注弹性工时推算与考勤加班计算'
    };
  }
});

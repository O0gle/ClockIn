// app.js
App({
  onLaunch() {
    // 初始化云开发环境（用于 sendMail 邮件发送云函数）
    if (wx.cloud) {
      try {
        wx.cloud.init({
          traceUser: true
        });
      } catch (e) {
        console.error('wx.cloud.init error', e);
      }
    }

    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
  },
  globalData: {
    userInfo: null
  }
})

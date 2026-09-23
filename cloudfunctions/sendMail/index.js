// cloudfunctions/sendMail/index.js
const nodemailer = require('nodemailer');

/**
 * 根据邮箱地址推断 SMTP 服务器配置
 */
function getSmtpConfig(email, customHost, customPort) {
  if (customHost) {
    return {
      host: customHost,
      port: customPort ? Number(customPort) : 465,
      secure: Number(customPort) === 587 ? false : true
    };
  }

  const domain = (email || '').split('@')[1] || '';
  const lowerDomain = domain.toLowerCase();

  switch (lowerDomain) {
    case 'qq.com':
    case 'foxmail.com':
      return { host: 'smtp.qq.com', port: 465, secure: true };
    case '163.com':
      return { host: 'smtp.163.com', port: 465, secure: true };
    case '126.com':
      return { host: 'smtp.126.com', port: 465, secure: true };
    case 'sina.com':
      return { host: 'smtp.sina.com', port: 465, secure: true };
    case 'sohu.com':
      return { host: 'smtp.sohu.com', port: 465, secure: true };
    case 'aliyun.com':
      return { host: 'smtp.aliyun.com', port: 465, secure: true };
    case 'outlook.com':
    case 'hotmail.com':
      return { host: 'smtp.office365.com', port: 587, secure: false };
    case 'gmail.com':
      return { host: 'smtp.gmail.com', port: 465, secure: true };
    default:
      // 默认尝试 smtp.{domain}
      return { host: `smtp.${lowerDomain}`, port: 465, secure: true };
  }
}

exports.main = async (event, context) => {
  try {
    const {
      senderEmail,
      senderPass,
      senderName,
      to,
      subject,
      text,
      html,
      csvData,
      fileName,
      smtpHost,
      smtpPort
    } = event;

    // 参数校验
    if (!senderEmail || !senderPass) {
      return {
        success: false,
        message: '发件邮箱或授权码未设置，请在小程序「设置」中填写发件邮箱与SMTP授权码'
      };
    }

    if (!to) {
      return {
        success: false,
        message: '收件邮箱未指定，请在小程序「设置」中填写接收邮箱地址'
      };
    }

    // 智能推断 SMTP 服务器
    const smtp = getSmtpConfig(senderEmail, smtpHost, smtpPort);

    // 创建 SMTP 邮件传输客户端
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: senderEmail.trim(),
        pass: senderPass.trim()
      },
      // 超时时间
      connectionTimeout: 10000,
      greetingTimeout: 10000
    });

    const displayName = senderName || '弹性打卡助手';
    const mailOptions = {
      from: `"${displayName}" <${senderEmail.trim()}>`,
      to: to.trim(),
      subject: subject || '考勤与加班明细报表',
      text: text || '',
      html: html || `<p>${text || '暂无内容'}</p>`,
      attachments: []
    };

    // 如果传入了 CSV 报表数据，自动挂载为附件
    if (csvData) {
      mailOptions.attachments.push({
        filename: fileName || '考勤与加班报表.csv',
        content: csvData,
        encoding: 'utf8'
      });
    }

    // 执行发信
    const info = await transporter.sendMail(mailOptions);
    console.log('邮件投递成功:', info.messageId);

    return {
      success: true,
      messageId: info.messageId,
      message: '邮件发送成功'
    };
  } catch (error) {
    console.error('发送邮件失败:', error);
    let errorMsg = error.message || String(error);

    if (errorMsg.includes('Invalid login') || errorMsg.includes('auth') || errorMsg.includes('Authentication failed')) {
      errorMsg = '发件邮箱登录验证失败，请确认邮箱账号是否正确，以及是否填入了正确的 16 位 SMTP 授权码（非登录密码）！';
    } else if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ECONNREFUSED')) {
      errorMsg = '连接邮箱 SMTP 服务器超时，请检查网络或确认邮箱是否开启了 SMTP 服务。';
    }

    return {
      success: false,
      error: errorMsg
    };
  }
};

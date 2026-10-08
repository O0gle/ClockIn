/**
 * 窝囊费等价物换算工具类
 * 将打工人实时赚取的窝囊费金额，具象化转换为高频消费品或愿望清单
 */

// 阶梯等价物配置表（按单价递增，从 4元小确幸 一直覆盖到 10000元+ 终极自由心愿）
const SALARY_EQUIVALENTS = [
  // 1. 基础小确幸 (4 ~ 25元)
  { id: 'ice_lemonade', name: '蜜雪柠檬水', price: 4, icon: '🍋' },
  { id: 'steamed_bun', name: '肉包配豆浆', price: 7, icon: '🥟' },
  { id: 'mcd_poor', name: '麦门穷鬼套餐', price: 13.9, icon: '🍔' },
  { id: 'milktea', name: '霸王茶姬', price: 18, icon: '🧋' },
  { id: 'pork_rice', name: '隆江猪脚饭', price: 25, icon: '🍚' },

  // 2. 日常改善与回血 (33 ~ 260元)
  { id: 'starbucks', name: '星巴克大杯', price: 33, icon: '☕' },
  { id: 'kfc_v50', name: '疯四V50', price: 50, icon: '🍗' },
  { id: 'taxi_freedom', name: '打车回家自由', price: 80, icon: '🚕' },
  { id: 'hotpot', name: '海底捞单人锅', price: 150, icon: '🍲' },
  { id: 'massage', name: '周末推拿按摩', price: 260, icon: '💆' },

  // 3. 高价值心愿与精神解脱 (298 ~ 1800元)
  { id: 'steam_game', name: '3A游戏大作', price: 298, icon: '🎮' },
  { id: 'disney', name: '迪士尼门票', price: 399, icon: '🏰' },
  { id: 'concert', name: '演唱会看台票', price: 580, icon: '🎫' },
  { id: 'hotel', name: '周末微度假', price: 888, icon: '🏨' },
  { id: 'airpods', name: '工位降噪耳机', price: 1399, icon: '🎧' },
  { id: 'flight', name: '往返海边机票', price: 1800, icon: '✈️' },

  // 4. 万元顶奢与自由图腾 (2599 ~ 10000元)
  { id: 'ipad', name: '生产力iPad', price: 2599, icon: '📱' },
  { id: 'chair', name: '人体工学椅', price: 3600, icon: '💺' },
  { id: 'gpu', name: '顶级光追显卡', price: 4999, icon: '💻' },
  { id: 'phone', name: '旗舰顶配手机', price: 6999, icon: '📲' },
  { id: 'brompton', name: '小布折叠车', price: 8888, icon: '🚲' },
  { id: 'iceland', name: '冰岛极光基金', price: 10000, icon: '🌌' }
];

/**
 * 根据今日已赚金额换算等价物文案与图标
 * @param {number} todaySalary - 今日已赚金额（元）
 * @returns {{ icon: string, text: string }}
 */
function calculateSalaryEquivalent(todaySalary) {
  const amount = typeof todaySalary === 'number' && !isNaN(todaySalary) ? todaySalary : 0;

  // 1. 尚未打卡或未产生收益
  if (amount <= 0) {
    return {
      icon: '🌱',
      text: '打卡后开启今日收米进度'
    };
  }

  // 2. 金额不足以兑换第一档商品 (4元 柠檬水)
  const firstTier = SALARY_EQUIVALENTS[0];
  if (amount < firstTier.price) {
    const diff = (firstTier.price - amount).toFixed(2);
    return {
      icon: firstTier.icon,
      text: `距${firstTier.name}还差¥${diff}`
    };
  }

  // 3. 寻找当前已解锁的最高档位和下一个待解锁档位
  let currentTier = SALARY_EQUIVALENTS[0];
  let nextTier = null;

  for (let i = 0; i < SALARY_EQUIVALENTS.length; i++) {
    if (amount >= SALARY_EQUIVALENTS[i].price) {
      currentTier = SALARY_EQUIVALENTS[i];
    } else {
      nextTier = SALARY_EQUIVALENTS[i];
      break;
    }
  }

  // 4. 如果还有更高档位待解锁
  if (nextTier) {
    const diff = (nextTier.price - amount).toFixed(2);
    return {
      icon: currentTier.icon,
      text: `已赚${currentTier.name} · 距${nextTier.name}差¥${diff}`
    };
  }

  // 5. 超过最高档位（日赚金额 >= 10000 元）
  return {
    icon: '👑',
    text: '日入过万！已解锁冰岛极光自由'
  };
}

module.exports = {
  SALARY_EQUIVALENTS,
  calculateSalaryEquivalent
};

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // User Identity
  username: { type: String, required: true, unique: true, trim: true },
  userId: { type: String, required: true, unique: true, trim: true },

  // Energy System
  energy: { type: Number, default: 1000, min: 0 },
  maxEnergy: { type: Number, default: 1000, min: 1000 },
  lastTapTime: { type: Date, default: Date.now },

  // Tap Power
  perTap: { type: Number, default: 1, min: 1 },
  tapPoints: { type: Number, default: 0, min: 0 },

  // Per Hour System
  perHour: { type: Number, default: 0, min: 0 },
  lastHourlyAward: { type: Date, default: Date.now },

  // Levels
  level: { type: Number, default: 0, min: 0 },
  totalPoints: { type: Number, default: 0, min: 0 },

  // Daily Claim System
  dailyClaimStreak: { type: Number, default: 0, min: 0 },
  lastDailyClaim: { type: Date, default: null },
  nextDailyClaimAmount: { type: Number, default: 1000 },

  // Referral System
  referral: { type: String, default: null, trim: true },
  referralPoints: { type: Number, default: 0, min: 0 },
  directReferrals: [{
    username: { type: String, required: true },
    userId: { type: String, required: true },
    pointsEarned: { type: Number, default: 0, min: 0 },
    joinedAt: { type: Date, default: Date.now }
  }],
  indirectReferrals: [{
    username: { type: String, required: true },
    userId: { type: String, required: true },
    referredBy: { type: String, required: true },
    pointsEarned: { type: Number, default: 0, min: 0 },
    joinedAt: { type: Date, default: Date.now }
  }],

  // Hug Points System with high precision
  hugPoints: { 
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: (v) => v ? Number(parseFloat(v.toString()).toFixed(4)) : 0
  },
  lastConversionTime: { type: Date },

  // Upgrade System
  upgradeCosts: {
    perTap: { type: Number, default: 1024 },
    maxEnergy: { type: Number, default: 1024 }
  },

  // System Fields
  isActive: { type: Boolean, default: true },
  lastActive: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Pre-save middleware
userSchema.pre('save', function(next) {
  this.totalPoints = this.tapPoints + this.referralPoints;
  this.lastActive = new Date();
  this.updateLevel();
  next();
});

// Level Update Method
userSchema.methods.updateLevel = function() {
  const levelThresholds = [0, 25000, 50000, 300000, 500000, 1000000, 10000000, 100000000, 500000000, 1000000000];
  for (let i = levelThresholds.length - 1; i >= 0; i--) {
    if (this.totalPoints >= levelThresholds[i]) {
      this.level = i;
      break;
    }
  }
};

// Daily Claim Methods
userSchema.methods.calculateDailyClaimAmount = function() {
  const streakWeek = Math.floor(this.dailyClaimStreak / 7);
  switch(streakWeek) {
    case 0: // Day 1-7
      return 1000;
    case 1: // Day 8-14
      return 5000;
    case 2: // Day 15-21
      return 10000;
    case 3: // Day 22-28
      return 20000;
    case 4: // Day 29-35
      return 35000;
    default: // Day 36+
      return 50000;
  }
};

userSchema.methods.canClaimDaily = function() {
  if (!this.lastDailyClaim) return true;
  
  const now = new Date();
  const lastClaim = new Date(this.lastDailyClaim);
  
  // Reset to start of day for both dates
  now.setHours(0, 0, 0, 0);
  lastClaim.setHours(0, 0, 0, 0);
  
  // Calculate days difference
  const diffTime = Math.abs(now - lastClaim);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // If exactly 1 day has passed, maintain streak
  // If more than 1 day has passed, streak will be reset
  return diffDays >= 1;
};

userSchema.methods.processDailyClaim = function() {
  const now = new Date();
  
  if (!this.canClaimDaily()) {
    throw new Error('Daily claim not yet available');
  }
  
  // Check if streak should be reset (more than 1 day passed)
  if (this.lastDailyClaim) {
    const lastClaim = new Date(this.lastDailyClaim);
    lastClaim.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    
    const diffTime = Math.abs(now - lastClaim);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 1) {
      this.dailyClaimStreak = 0;
    }
  }
  
  // Calculate reward
  const rewardAmount = this.calculateDailyClaimAmount();
  
  // Update user data
  this.tapPoints += rewardAmount;
  this.dailyClaimStreak += 1;
  this.lastDailyClaim = now;
  this.nextDailyClaimAmount = this.calculateDailyClaimAmount();
  
  return {
    claimedAmount: rewardAmount,
    newStreak: this.dailyClaimStreak,
    nextClaimAmount: this.nextDailyClaimAmount
  };
};

// Energy Methods
userSchema.methods.getCurrentEnergy = function() {
  const currentTime = Date.now();
  const secondsSinceLastTap = Math.floor((currentTime - this.lastTapTime) / 1000);
  const energyRegenerated = secondsSinceLastTap * this.perTap;
  return Math.min(this.energy + energyRegenerated, this.maxEnergy);
};

userSchema.methods.handleTap = function() {
  const currentEnergy = this.getCurrentEnergy();
  if (currentEnergy > 0) {
    this.energy = currentEnergy - 1;
    this.tapPoints += this.perTap;
    this.lastTapTime = Date.now();
    return this.perTap;
  } else {
    throw new Error('Insufficient energy to tap');
  }
};

// Points Methods
userSchema.methods.awardHourlyPoints = function() {
  const now = new Date();
  const hoursSinceLastAward = Math.floor((now - this.lastHourlyAward) / (1000 * 60 * 60));
  if (hoursSinceLastAward > 0) {
    const pointsAwarded = this.perHour * hoursSinceLastAward;
    this.tapPoints += pointsAwarded;
    this.lastHourlyAward = now;
    return pointsAwarded;
  }
  return 0;
};

// Upgrade Methods
userSchema.methods.upgradeTapPower = function() {
  const cost = this.upgradeCosts.perTap;
  if (this.tapPoints >= cost) {
    this.tapPoints -= cost;
    this.perTap += 1;
    this.upgradeCosts.perTap *= 2;
    return true;
  }
  throw new Error('Insufficient points to upgrade tap power');
};

userSchema.methods.upgradeEnergyLimit = function() {
  const cost = this.upgradeCosts.maxEnergy;
  if (this.tapPoints >= cost) {
    this.tapPoints -= cost;
    this.maxEnergy += 500;
    this.upgradeCosts.maxEnergy *= 2;
    return true;
  }
  throw new Error('Insufficient points to upgrade energy limit');
};

// Hug Points Methods
userSchema.methods.convertToHugPoints = function(pointsToConvert) {
  const pointsNum = parseFloat(pointsToConvert);
  
  if (isNaN(pointsNum)) {
    throw new Error('Invalid points value');
  }
  
  if (pointsNum < 1) {
    throw new Error('Minimum 1 point required for conversion');
  }
  
  if (this.tapPoints + this.referralPoints < pointsNum) {
    throw new Error('Insufficient points available for conversion');
  }

  const newHugPoints = Number((pointsNum / 10000).toFixed(4));
  const totalPoints = this.tapPoints + this.referralPoints;
  const tapPointsRatio = this.tapPoints / totalPoints;
  const referralPointsRatio = this.referralPoints / totalPoints;
  
  this.tapPoints -= Math.round(pointsNum * tapPointsRatio);
  this.referralPoints -= Math.round(pointsNum * referralPointsRatio);
  this.hugPoints = Number((parseFloat(this.hugPoints.toString()) + newHugPoints).toFixed(4));
  this.lastConversionTime = new Date();
  
  return newHugPoints;
};

userSchema.methods.getHugPointsValue = function() {
  const totalAvailablePoints = this.tapPoints + this.referralPoints;
  const convertibleHugPoints = Number((totalAvailablePoints / 10000).toFixed(4));
  
  return {
    hugPoints: Number(parseFloat(this.hugPoints.toString()).toFixed(4)),
    availablePointsForConversion: convertibleHugPoints,
    minimumConversionAmount: 0.0001,
    minimumPointsNeeded: 1,
    totalPointsRemaining: totalAvailablePoints,
    conversionRate: '1 point = 0.0001 Hug points'
  };
};

// Information Methods
userSchema.methods.getAllPointsInfo = function() {
  return {
    tapPoints: this.tapPoints,
    referralPoints: this.referralPoints,
    hugPoints: Number(parseFloat(this.hugPoints.toString()).toFixed(4)),
    totalPoints: this.totalPoints,
    availableForConversion: {
      hugPoints: Number((this.totalPoints / 10000).toFixed(4)),
      rawPoints: this.totalPoints
    },
    perTap: this.perTap,
    perHour: this.perHour,
    energy: this.getCurrentEnergy(),
    maxEnergy: this.maxEnergy,
    level: this.level,
    minimumConversion: {
      hugPoints: 0.0001,
      rawPoints: 1
    },
    conversionRate: '1 point = 0.0001 Hug points',
    upgradeCosts: this.upgradeCosts,
    dailyClaimInfo: {
      streak: this.dailyClaimStreak,
      nextClaimAmount: this.nextDailyClaimAmount,
      canClaim: this.canClaimDaily(),
      lastClaim: this.lastDailyClaim,
      streakWeek: Math.floor(this.dailyClaimStreak / 7) + 1,
      dayInWeek: (this.dailyClaimStreak % 7) + 1
    }
  };
};

// Leaderboard Static Method
userSchema.statics.getLeaderboardWithDetails = async function(type = 'points', userId = null) {
  try {
    let query = [];
    let sortField = {};
    let projectFields = {
      userId: 1,
      username: 1,
      level: 1,
      perTap: 1,
      perHour: 1,
      hugPoints: 1,
      tapPoints: 1,
      referralPoints: 1,
      totalPoints: 1,
      energy: 1,
      maxEnergy: 1,
      directReferrals: 1,
      indirectReferrals: 1,
      dailyClaimStreak: 1,
      totalReferrals: {
        $add: [
          { $size: "$directReferrals" },
          { $size: "$indirectReferrals" }
        ]
      }
    };

    // Set sort field based on type
    switch(type) {
      case 'points':
        sortField = { totalPoints: -1 };
        break;
      case 'hugPoints':
        sortField = { hugPoints: -1 };
        break;
      case 'referrals':
        sortField = { totalReferrals: -1 };
        break;
      case 'hourly':
        sortField = { perHour: -1 };
        break;
      case 'streak':
        sortField = { dailyClaimStreak: -1 };
        break;
      default:
        throw new Error('Invalid leaderboard type');
    }

    query = [
      { $project: projectFields },
      { $sort: sortField },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          users: { $push: "$$ROOT" }
        }
      },
      {
        $unwind: {
          path: "$users",
          includeArrayIndex: "position"
        }
      },
      {
        $project: {
          _id: 0,
          position: { $add: ["$position", 1] },
          totalCount: 1,
          user: "$users"
        }
      }
    ];

    const leaderboard = await this.aggregate(query);
    
    return {
      leaderboard: leaderboard.slice(0, 50),
      userPosition: userId ? leaderboard.find(entry => entry.user.userId === userId) : null,
      total: leaderboard.length > 0 ? leaderboard[0].totalCount : 0
    };
  } catch (error) {
    throw error;
  }
};

const User = mongoose.model('User', userSchema);

module.exports = User;
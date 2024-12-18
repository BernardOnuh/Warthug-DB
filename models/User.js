const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // User Identity
  username: { type: String, required: true, unique: true, trim: true },
  userId: { type: String, required: true, unique: true, trim: true },

  // Energy System
  energy: { type: Number, default: 1000, min: 0 },
  maxEnergy: { type: Number, default: 1000, min: 1000 },
  lastTapTime: { type: Date, default: Date.now },
  lastEnergyRefill: { type: Date },
  totalEnergyRefills: { type: Number, default: 0 },

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

  // Auto Mining System
  isAutoMining: { type: Boolean, default: false },
  autoMineStartTime: { type: Date },
  autoMineDuration: { type: Number, default: 0 }, // in milliseconds
  pendingAutoMinePoints: { type: Number, default: 0 },
  lastAutoMineEnd: { type: Date },
  autoClaimHistory: [{
    claimTime: { type: Date, default: Date.now },
    pointsClaimed: { type: Number, default: 0 }
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
  
  now.setHours(0, 0, 0, 0);
  lastClaim.setHours(0, 0, 0, 0);
  
  const diffTime = Math.abs(now - lastClaim);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays >= 1;
};

userSchema.methods.processDailyClaim = function() {
  const now = new Date();
  
  if (!this.canClaimDaily()) {
    throw new Error('Daily claim not yet available');
  }
  
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
  
  const rewardAmount = this.calculateDailyClaimAmount();
  
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

userSchema.methods.refillEnergy = function() {
  const now = new Date();
  
  if (this.lastEnergyRefill && now - this.lastEnergyRefill < 300000) {
    throw new Error('Energy refill is on cooldown');
  }
  
  this.energy = this.maxEnergy;
  this.lastEnergyRefill = now;
  this.totalEnergyRefills++;
  
  return this.energy;
};

// Tap Methods
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

// Auto Mining Methods
userSchema.methods.startAutoMine = function(duration = 7200000) {
  this.isAutoMining = true;
  this.autoMineStartTime = new Date();
  this.autoMineDuration = duration;
  this.pendingAutoMinePoints = 0;
  return true;
};


userSchema.methods.processAutoMine = function() {
  if (!this.isAutoMining) return 0;
  
  const now = new Date();
  const elapsedTime = now - this.autoMineStartTime;
  
  // Check if mining duration is complete
  if (elapsedTime >= this.autoMineDuration) {
    this.isAutoMining = false;
    this.autoMineStartTime = null;
    this.lastAutoMineEnd = now;
    return 0;
  }
  
  // Check if it's time for hourly claim
  const lastClaimTime = this.autoClaimHistory.length > 0 
    ? this.autoClaimHistory[this.autoClaimHistory.length - 1].claimTime 
    : this.autoMineStartTime;
  
  const hoursSinceLastClaim = (now - lastClaimTime) / (60 * 60 * 1000);
  
  if (hoursSinceLastClaim >= 1) {
    // Calculate points for the hour (500 points per hour)
    const pointsEarned = 500;
    this.pendingAutoMinePoints += pointsEarned;
    
    // Add to claim history
    this.autoClaimHistory.push({
      claimTime: now,
      pointsClaimed: pointsEarned
    });
  }
  
  return this.pendingAutoMinePoints;
};

userSchema.methods.claimAutoMineRewards = function() {
  if (this.pendingAutoMinePoints <= 0) {
    throw new Error('No pending rewards to claim');
  }
  
  const pointsToClaim = this.pendingAutoMinePoints;
  this.tapPoints += pointsToClaim;
  this.pendingAutoMinePoints = 0;
  
  this.autoClaimHistory.push({
    claimTime: new Date(),
    pointsClaimed: pointsToClaim
  });
  
  return pointsToClaim;
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
    },
    autoMine: {
      isActive: this.isAutoMining,
      pendingPoints: this.pendingAutoMinePoints,
      startTime: this.autoMineStartTime,
      endTime: this.isAutoMining ? 
        new Date(this.autoMineStartTime.getTime() + this.autoMineDuration) : 
        this.lastAutoMineEnd,
      timeRemaining: this.isAutoMining ? 
        Math.max(0, this.autoMineDuration - (Date.now() - this.autoMineStartTime)) : 0,
      claimHistory: this.autoClaimHistory
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
      leaderboard: leaderboard.slice(0, 50), // Top 50 users
      userPosition: userId ? leaderboard.find(entry => entry.user.userId === userId) : null,
      total: leaderboard.length > 0 ? leaderboard[0].totalCount : 0
    };
  } catch (error) {
    throw error;
  }
};

// Virtual fields (if needed)
userSchema.virtual('totalReferrals').get(function() {
  return this.directReferrals.length + this.indirectReferrals.length;
});

userSchema.virtual('nextLevelThreshold').get(function() {
  const levelThresholds = [0, 25000, 50000, 300000, 500000, 1000000, 10000000, 100000000, 500000000, 1000000000];
  for (let i = 0; i < levelThresholds.length; i++) {
    if (this.totalPoints < levelThresholds[i]) {
      return levelThresholds[i];
    }
  }
  return levelThresholds[levelThresholds.length - 1];
});

userSchema.virtual('pointsToNextLevel').get(function() {
  return this.nextLevelThreshold - this.totalPoints;
});

// Index configurations for performance
userSchema.index({ userId: 1 });
userSchema.index({ username: 1 });
userSchema.index({ totalPoints: -1 });
userSchema.index({ hugPoints: -1 });
userSchema.index({ dailyClaimStreak: -1 });
userSchema.index({ perHour: -1 });

// Create the model
const User = mongoose.model('User', userSchema);

// Export the model
module.exports = User;
const mongoose = require('mongoose');

// Card Schema
const cardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  basePrice: { type: Number, required: true, min: 0 },
  currentPrice: { type: Number, required: true, min: 0 },
  perHourIncrease: { type: Number, required: true, min: 0 },
  currentPerHour: { type: Number, default: 0, min: 0 },
  requiredLevel: { type: Number, required: true, min: 0 },
  upgradeCount: { type: Number, default: 0, min: 0 },
  lastUpgradeTime: { type: Date },
  imageUrl: { type: String, required: true },
  isUnlocked: { type: Boolean, default: false },
  priceIncreaseRate: { type: Number, required: true, min: 1 },
  perHourIncreaseRate: { type: Number, required: true, min: 1 },
  baseCooldown: { type: Number, required: true, min: 0 },
  cooldownIncreaseRate: { type: Number, required: true, min: 1 },
  currentCooldown: { type: Number, default: 0, min: 0 }
}, { _id: false });

// User Schema
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
    // In the userSchema definition
  pointsConverted: { type: Number, default: 0 }, 
  hugPoints: { type: Number, default: 0 },
  

  // Card System
  cards: {
    finance: {
      type: Map,
      of: cardSchema,
      default: () => new Map()
    },
    predators: {
      type: Map,
      of: cardSchema,
      default: () => new Map()
    },
    hogPower: {
      type: Map,
      of: cardSchema,
      default: () => new Map()
    }
  },

  dailyClaimStreak: { type: Number, default: 0 },
  lastDailyClaim: { type: Date },
  nextDailyClaimAmount: { type: Number, default: 1000 },
  
}, {
  timestamps: true,
  toJSON: { 
    getters: true,
    transform: function(doc, ret) {
      // Convert Maps to plain objects
      if (ret.cards) {
        const transformedCards = {};
        for (const section in ret.cards) {
          if (ret.cards[section] instanceof Map) {
            transformedCards[section] = {};
            ret.cards[section].forEach((value, key) => {
              transformedCards[section][key] = value;
            });
          } else {
            transformedCards[section] = ret.cards[section];
          }
        }
        ret.cards = transformedCards;
      }
      return ret;
    }
  },
  toObject: { getters: true }
});

userSchema.methods.getAvailableForConversion = function() {
  const totalPoints = (this.tapPoints || 0) + (this.referralPoints || 0);
  const pointsConverted = this.pointsConverted || 0;
  return Math.max(0, totalPoints - pointsConverted);
};
// Card Methods
userSchema.methods.getCard = function(section, cardName) {
  try {
    const sectionCards = this.cards[section];
    if (!sectionCards || !(sectionCards instanceof Map)) {
      console.error(`Invalid section or not a Map: ${section}`);
      return null;
    }
    return sectionCards.get(cardName);
  } catch (error) {
    console.error('Error getting card:', error);
    return null;
  }
};

userSchema.methods.setCard = function(section, cardName, cardData) {
  try {
    const sectionCards = this.cards[section];
    if (!sectionCards || !(sectionCards instanceof Map)) {
      this.cards[section] = new Map();
    }
    this.cards[section].set(cardName, cardData);
    return true;
  } catch (error) {
    console.error('Error setting card:', error);
    return false;
  }
};

userSchema.methods.getAllCards = function() {
  const allCards = {};
  ['finance', 'predators', 'hogPower'].forEach(section => {
    const sectionCards = this.cards[section];
    allCards[section] = {};
    if (sectionCards instanceof Map) {
      sectionCards.forEach((card, name) => {
        allCards[section][name] = this.getCardInfo(section, name);
      });
    }
  });
  return allCards;
};

// Initialize Map helper
userSchema.methods.initializeCards = function() {
  ['finance', 'predators', 'hogPower'].forEach(section => {
    if (!this.cards[section] || !(this.cards[section] instanceof Map)) {
      this.cards[section] = new Map();
    }
  });
};


// Indexes
userSchema.index({ userId: 1 });
userSchema.index({ username: 1 });
userSchema.index({ totalPoints: -1 });
userSchema.index({ hugPoints: -1 });
userSchema.index({ dailyClaimStreak: -1 });
userSchema.index({ perHour: -1 });

// Pre-save middleware
userSchema.pre('save', function(next) {
  this.totalPoints = (this.tapPoints || 0) + (this.referralPoints || 0);
  this.lastActive = new Date();
  this.updateLevel();
  next();
});

// Card Methods
userSchema.methods.getCard = function(section, cardName) {
  try {
    if (!this.cards?.[section]) return null;
    return this.cards[section] instanceof Map ? this.cards[section].get(cardName) : null;
  } catch (error) {
    console.error('Error accessing card:', error);
    return null;
  }
};

userSchema.methods.getAllCards = function() {
  const allCards = {};
  ['finance', 'predators', 'hogPower'].forEach(section => {
    allCards[section] = {};
    if (this.cards?.[section] instanceof Map) {
      this.cards[section].forEach((card, name) => {
        allCards[section][name] = this.getCardInfo(section, name);
      });
    }
  });
  return allCards;
};

userSchema.methods.upgradeCard = async function(section, cardName) {
  const card = this.getCard(section, cardName);
  if (!card) throw new Error('Card not found');
  if (this.level < card.requiredLevel) throw new Error('Level requirement not met');
  if (this.tapPoints < card.currentPrice) throw new Error('Insufficient points');

  if (card.lastUpgradeTime) {
    const currentCooldown = card.currentCooldown || card.baseCooldown;
    const cooldownTime = currentCooldown * 60 * 1000;
    const timeSinceLastUpgrade = Date.now() - card.lastUpgradeTime;
    
    if (timeSinceLastUpgrade < cooldownTime) {
      const remainingTime = Math.ceil((cooldownTime - timeSinceLastUpgrade) / (60 * 1000));
      throw new Error(`Card is still on cooldown. ${remainingTime} minutes remaining.`);
    }
  }

  // Deduct points and increment upgrade count
  this.tapPoints -= card.currentPrice;
  card.upgradeCount += 1;
  
  // Update base per hour increase for next level
  card.perHourIncrease = Math.floor(card.basePrice * Math.pow(card.perHourIncreaseRate, card.upgradeCount - 1));
  
  // Calculate new values for next upgrade
  card.currentPrice = Math.floor(card.basePrice * Math.pow(card.priceIncreaseRate, card.upgradeCount));
  card.currentPerHour = Math.floor(card.perHourIncrease * Math.pow(card.perHourIncreaseRate, card.upgradeCount));
  card.currentCooldown = Math.floor(card.baseCooldown * Math.pow(card.cooldownIncreaseRate, card.upgradeCount));
  
  // Update timestamps and status
  card.lastUpgradeTime = new Date();
  card.isUnlocked = true;
  
  // Update user's total per hour earnings
  this.perHour = this.calculateTotalPerHour();

  // Return updated card with next upgrade information
  return {
    ...card.toObject(),
    nextPrice: Math.floor(card.basePrice * Math.pow(card.priceIncreaseRate, card.upgradeCount + 1)),
    nextPerHour: Math.floor(card.perHourIncrease * Math.pow(card.perHourIncreaseRate, card.upgradeCount + 1)),
    nextCooldown: Math.floor(card.baseCooldown * Math.pow(card.cooldownIncreaseRate, card.upgradeCount + 1)),
    cooldownRemaining: 0,
    cooldownEnds: card.lastUpgradeTime.getTime() + (card.currentCooldown * 60 * 1000),
    canUpgrade: false,
    timeToNextUpgrade: card.currentCooldown * 60
  };
};

userSchema.methods.getCardInfo = function(section, cardName) {
  const card = this.getCard(section, cardName);
  if (!card) return null;

  const nextUpgradeCount = (card.upgradeCount || 0) + 1;
  const currentCooldown = card.currentCooldown || card.baseCooldown || 0;
  let cooldownRemaining = 0;
  let cooldownEnds = null;

  if (card.lastUpgradeTime) {
    const cooldownTime = currentCooldown * 60 * 1000;
    const timeSinceLastUpgrade = Date.now() - card.lastUpgradeTime;
    cooldownRemaining = Math.max(0, cooldownTime - timeSinceLastUpgrade);
    cooldownEnds = new Date(card.lastUpgradeTime.getTime() + cooldownTime);
  }

  return {
    ...card.toObject(),
    nextPrice: Math.floor(card.basePrice * Math.pow(card.priceIncreaseRate || 1, nextUpgradeCount)),
    nextPerHour: Math.floor(card.perHourIncrease * Math.pow(card.perHourIncreaseRate || 1, nextUpgradeCount)),
    nextCooldown: Math.floor(card.baseCooldown * Math.pow(card.cooldownIncreaseRate || 1, nextUpgradeCount)),
    currentCooldown,
    cooldownRemaining,
    cooldownEnds,
    canUpgrade: cooldownRemaining === 0 && 
                this.level >= (card.requiredLevel || 0) && 
                this.tapPoints >= (card.currentPrice || 0),
    timeToNextUpgrade: cooldownRemaining > 0 ? Math.ceil(cooldownRemaining / (60 * 1000)) : 0
  };
};

userSchema.methods.calculateTotalPerHour = function() {
  let total = 0;
  ['finance', 'predators', 'hogPower'].forEach(section => {
    if (this.cards?.[section] instanceof Map) {
      this.cards[section].forEach(card => {
        total += card.currentPerHour || 0;
      });
    }
  });
  return total;
};

// Level Methods
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
    case 0: return 1000;
    case 1: return 5000;
    case 2: return 10000;
    case 3: return 20000;
    case 4: return 35000;
    default: return 50000;
  }
};


// Daily Claim Methods
userSchema.methods.hasClaimedToday = function() {
  if (!this.lastDailyClaim) return false;
  
  const now = new Date();
  const lastClaim = new Date(this.lastDailyClaim);
  
  return now.getDate() === lastClaim.getDate() && 
         now.getMonth() === lastClaim.getMonth() && 
         now.getFullYear() === lastClaim.getFullYear();
};

userSchema.methods.canClaimDaily = function() {
  if (this.hasClaimedToday()) return false;
  if (!this.lastDailyClaim) return true;
  
  const now = new Date();
  const lastClaim = new Date(this.lastDailyClaim);
  const hoursSinceLastClaim = (now - lastClaim) / (1000 * 60 * 60);
  
  return hoursSinceLastClaim >= 24;
};

userSchema.methods.calculateDailyClaimAmount = function() {
  const streakWeek = Math.floor((this.dailyClaimStreak || 0) / 7);
  switch(streakWeek) {
    case 0: return 1000;  // Days 1-7
    case 1: return 5000;  // Days 8-14
    case 2: return 10000; // Days 15-21
    case 3: return 20000; // Days 22-28
    case 4: return 35000; // Days 29-35
    default: return 50000; // Day 36+
  }
};

userSchema.methods.processDailyClaim = function() {
  const now = new Date();
  
  if (this.hasClaimedToday()) {
    throw new Error('Already claimed today. Next claim available tomorrow.');
  }
  
  if (this.lastDailyClaim) {
    // Calculate hours since last claim
    const hoursSinceLastClaim = (now - this.lastDailyClaim) / (1000 * 60 * 60);
    
    // Reset streak if more than 48 hours passed
    if (hoursSinceLastClaim > 48) {
      this.dailyClaimStreak = 0;
    } else if (hoursSinceLastClaim < 24) {
      throw new Error('Must wait 24 hours between claims.');
    }
  }
  
  const rewardAmount = this.calculateDailyClaimAmount();
  this.tapPoints += rewardAmount;
  this.dailyClaimStreak = (this.dailyClaimStreak || 0) + 1;
  this.lastDailyClaim = now;
  
  // Save changes immediately
  this.markModified('dailyClaimStreak');
  this.markModified('lastDailyClaim');
  this.markModified('tapPoints');
  
  return {
    claimedAmount: rewardAmount,
    newStreak: this.dailyClaimStreak,
    nextClaimAmount: this.calculateDailyClaimAmount()
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
userSchema.methods.startAutoMine = function(duration = 7200000) { // Default 2 hours
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
  
  if (elapsedTime >= this.autoMineDuration) {
    this.isAutoMining = false;
    this.autoMineStartTime = null;
    this.lastAutoMineEnd = now;
    return 0;
  }
  
  const lastClaimTime = this.autoClaimHistory.length > 0 
    ? this.autoClaimHistory[this.autoClaimHistory.length - 1].claimTime 
    : this.autoMineStartTime;
  
  const hoursSinceLastClaim = (now - lastClaimTime) / (60 * 60 * 1000);
  
  if (hoursSinceLastClaim >= 1) {
    const pointsEarned = 500;
    this.pendingAutoMinePoints += pointsEarned;
    
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

userSchema.methods.convertToHugPoints = function(pointsToConvert) {
  const pointsNum = parseFloat(pointsToConvert);
  
  if (isNaN(pointsNum)) {
    throw new Error('Invalid points value');
  }
  if (pointsNum < 1) {
    throw new Error('Minimum 1 point required for conversion');
  }
  
  // Calculate available points for conversion
  const totalPoints = this.tapPoints + (this.referralPoints || 0);
  const pointsConverted = this.pointsConverted || 0;
  const availableForConversion = Math.max(0, totalPoints - pointsConverted);

  if (availableForConversion <= 0) {
    throw new Error('No points available for conversion');
  }
  
  if (pointsNum > availableForConversion) {
    throw new Error(`Can only convert ${availableForConversion} points. ${pointsConverted} points already converted`);
  }

  const newHugPoints = Number((pointsNum / 10000).toFixed(4));
  
  // Update converted points tracker
  this.pointsConverted = (this.pointsConverted || 0) + pointsNum;
  
  // Update hug points
  this.hugPoints = Number((parseFloat(this.hugPoints?.toString() || "0") + newHugPoints).toFixed(4));
  this.lastConversionTime = new Date();
  
  return newHugPoints;
};

// Information Methods
userSchema.methods.getAllPointsInfo = function() {
  // Ensure all base values have defaults
  const tapPoints = this.tapPoints || 0;
  const referralPoints = this.referralPoints || 0;
  const pointsConverted = this.pointsConverted || 0;
  const totalPoints = tapPoints + referralPoints;
  const availableForConversion = Math.max(0, totalPoints - pointsConverted);
  const dailyClaimStreak = this.dailyClaimStreak || 0;

  return {
    tapPoints: tapPoints,
    referralPoints: referralPoints,
    hugPoints: Number(parseFloat(this.hugPoints?.toString() || "0").toFixed(4)),
    totalPoints: totalPoints,
    pointsConverted: pointsConverted,
    availableForConversion: {
      hugPoints: Number((availableForConversion / 10000).toFixed(4)),
      rawPoints: availableForConversion
    },
    perTap: this.perTap || 1,
    perHour: this.perHour || 0,
    energy: this.getCurrentEnergy(),
    maxEnergy: this.maxEnergy || 1000,
    level: this.level || 0,
    minimumConversion: {
      hugPoints: 0.0001,
      rawPoints: 1
    },
    conversionRate: '1 point = 0.0001 Hug points',
    dailyClaimInfo: {
      streak: dailyClaimStreak,
      nextClaimAmount: this.nextDailyClaimAmount || 0,
      canClaim: this.canClaimDaily(),
      lastClaim: this.lastDailyClaim,
      streakWeek: Math.floor(dailyClaimStreak / 7) + 1,
      dayInWeek: (dailyClaimStreak % 7) + 1
    },
    autoMine: {
      isActive: this.isAutoMining || false,
      pendingPoints: this.pendingAutoMinePoints || 0,
      startTime: this.autoMineStartTime,
      endTime: this.isAutoMining ? 
        new Date(this.autoMineStartTime.getTime() + this.autoMineDuration) : 
        this.lastAutoMineEnd,
      timeRemaining: this.isAutoMining ? 
        Math.max(0, this.autoMineDuration - (Date.now() - this.autoMineStartTime)) : 0,
      claimHistory: this.autoClaimHistory || []
    }
  };
};

// Virtual fields
userSchema.virtual('totalReferrals').get(function() {
  return (this.directReferrals?.length || 0) + (this.indirectReferrals?.length || 0);
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

// Leaderboard Static Method
userSchema.statics.getLeaderboardWithDetails = async function(type = 'points', userId = null) {
  try {
    const sortField = {
      points: { totalPoints: -1 },
      hugPoints: { hugPoints: -1 },
      referrals: { totalReferrals: -1 },
      hourly: { perHour: -1 },
      streak: { dailyClaimStreak: -1 }
    }[type] || { totalPoints: -1 };

    const projectFields = {
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

    const pipeline = [
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

    const leaderboard = await this.aggregate(pipeline);
    
    return {
      leaderboard: leaderboard.slice(0, 50),
      userPosition: userId ? leaderboard.find(entry => entry.user.userId === userId) : null,
      total: leaderboard.length > 0 ? leaderboard[0].totalCount : 0
    };
  } catch (error) {
    throw error;
  }
};

// Export model
const User = mongoose.model('User', userSchema);
module.exports = User;
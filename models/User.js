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
    upgradeCosts: this.upgradeCosts
  };
};

// Referral Methods
userSchema.methods.addReferralPoints = function(points, isDirect = true, referredBy = null) {
  this.referralPoints += points;

  if (isDirect) {
    this.directReferrals.push({
      username: referredBy,
      userId: referredBy,
      pointsEarned: points
    });
  } else {
    this.indirectReferrals.push({
      username: referredBy,
      userId: referredBy,
      referredBy: referredBy,
      pointsEarned: points
    });
  }
  return points;
};

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
      default:
        throw new Error('Invalid leaderboard type');
    }

    // First get all users with ranking
    query = [
      { 
        $project: projectFields 
      },
      { 
        $sort: sortField 
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          users: { 
            $push: {
              userId: "$userId",
              username: "$username",
              level: "$level",
              perTap: "$perTap",
              perHour: "$perHour",
              hugPoints: "$hugPoints",
              tapPoints: "$tapPoints",
              referralPoints: "$referralPoints",
              totalPoints: "$totalPoints",
              energy: "$energy",
              maxEnergy: "$maxEnergy",
              directReferrals: "$directReferrals",
              indirectReferrals: "$indirectReferrals",
              totalReferrals: "$totalReferrals",
              lastHourlyAward: "$lastHourlyAward"
            }
          }
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
          userId: "$users.userId",
          username: "$users.username",
          level: "$users.level",
          perTap: "$users.perTap",
          perHour: "$users.perHour",
          hugPoints: "$users.hugPoints",
          tapPoints: "$users.tapPoints",
          referralPoints: "$users.referralPoints",
          totalPoints: "$users.totalPoints",
          energy: "$users.energy",
          maxEnergy: "$users.maxEnergy",
          directReferrals: "$users.directReferrals",
          indirectReferrals: "$users.indirectReferrals",
          totalReferrals: "$users.totalReferrals",
          lastHourlyAward: "$users.lastHourlyAward",
          position: { $add: ["$position", 1] },
          totalCount: 1
        }
      }
    ];

    const leaderboard = await this.aggregate(query);

    // Find the user's full entry in the leaderboard
    const userPosition = userId ? leaderboard.find(u => u.userId === userId) : null;
    
    // Clean up the leaderboard entries
    const cleanLeaderboard = leaderboard.slice(0, 50).map(user => {
      const { totalCount, ...userWithoutCount } = user;
      return userWithoutCount;
    });

    return {
      leaderboard: cleanLeaderboard,
      userPosition: userPosition ? {
        userId: userPosition.userId,
        username: userPosition.username,
        level: userPosition.level,
        perTap: userPosition.perTap,
        perHour: userPosition.perHour,
        hugPoints: userPosition.hugPoints,
        tapPoints: userPosition.tapPoints,
        referralPoints: userPosition.referralPoints,
        totalPoints: userPosition.totalPoints,
        energy: userPosition.energy,
        maxEnergy: userPosition.maxEnergy,
        directReferrals: userPosition.directReferrals,
        indirectReferrals: userPosition.indirectReferrals,
        totalReferrals: userPosition.totalReferrals,
        lastHourlyAward: userPosition.lastHourlyAward,
        position: userPosition.position
      } : null,
      total: leaderboard.length > 0 ? leaderboard[0].totalCount : 0
    };
  } catch (error) {
    throw error;
  }
};

const User = mongoose.model('User', userSchema);

module.exports = User;
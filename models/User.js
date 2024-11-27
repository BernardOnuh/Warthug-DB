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
  perHour: { type: Number, default: 0, min: 0 }, // Awarded hourly points
  lastHourlyAward: { type: Date, default: Date.now }, // Timestamp for hourly awards

  // Levels
  level: { type: Number, default: 0, min: 0 },
  totalPoints: { type: Number, default: 0, min: 0 }, // Accumulated points

  // Referral System
  referral: { type: String, default: null, trim: true }, // Referrer username
  referralPoints: { type: Number, default: 0, min: 0 }, // Points from referrals
  directReferrals: [
    {
      username: { type: String, required: true },
      userId: { type: String, required: true },
      pointsEarned: { type: Number, default: 0, min: 0 },
      joinedAt: { type: Date, default: Date.now }
    }
  ],
  indirectReferrals: [
    {
      username: { type: String, required: true },
      userId: { type: String, required: true },
      referredBy: { type: String, required: true },
      pointsEarned: { type: Number, default: 0, min: 0 },
      joinedAt: { type: Date, default: Date.now }
    }
  ],

  // Upgrade System
  upgradeCosts: {
    perTap: { type: Number, default: 1024 }, // Cost for upgrading tap power
    maxEnergy: { type: Number, default: 1024 } // Cost for upgrading energy limit
  },

  // System Fields
  isActive: { type: Boolean, default: true },
  lastActive: { type: Date, default: Date.now }
}, {
  timestamps: true // Automatically adds createdAt and updatedAt fields
});

// Middleware to update totalPoints
userSchema.pre('save', function (next) {
  this.totalPoints = this.tapPoints + this.referralPoints; // Add other point sources if applicable
  next();
});

// Methods

// Method to calculate current energy with regeneration
userSchema.methods.getCurrentEnergy = function () {
  const currentTime = Date.now();
  const secondsSinceLastTap = Math.floor((currentTime - this.lastTapTime) / 1000);
  const energyRegenerated = secondsSinceLastTap * this.perTap;
  return Math.min(this.energy + energyRegenerated, this.maxEnergy);
};

// Method to handle tap action
userSchema.methods.handleTap = function () {
  const currentEnergy = this.getCurrentEnergy();
  if (currentEnergy > 0) {
    this.energy = currentEnergy - 1; // Deduct 1 energy per tap
    this.tapPoints += this.perTap; // Add points based on tap power
    this.lastTapTime = Date.now();
  } else {
    throw new Error('Insufficient energy to tap');
  }
};

// Method to award hourly points
userSchema.methods.awardHourlyPoints = function () {
  const now = new Date();
  const hoursSinceLastAward = Math.floor((now - this.lastHourlyAward) / (1000 * 60 * 60));
  if (hoursSinceLastAward > 0) {
    this.tapPoints += this.perHour * hoursSinceLastAward;
    this.lastHourlyAward = now;
  }
};

// Method to upgrade tap power
userSchema.methods.upgradeTapPower = function () {
  const cost = this.upgradeCosts.perTap;
  if (this.tapPoints >= cost) {
    this.tapPoints -= cost;
    this.perTap += 1;
    this.upgradeCosts.perTap *= 2; // Increase upgrade cost
  } else {
    throw new Error('Insufficient points to upgrade tap power');
  }
};

// Method to upgrade energy limit
userSchema.methods.upgradeEnergyLimit = function () {
  const cost = this.upgradeCosts.maxEnergy;
  if (this.tapPoints >= cost) {
    this.tapPoints -= cost;
    this.maxEnergy += 500; // Increment max energy
    this.upgradeCosts.maxEnergy *= 2; // Increase upgrade cost
  } else {
    throw new Error('Insufficient points to upgrade energy limit');
  }
};

// Method to check level based on total points
userSchema.methods.updateLevel = function () {
  const levelThresholds = [0, 25000, 50000, 300000, 500000, 1000000, 10000000, 100000000, 500000000, 1000000000];
  for (let i = levelThresholds.length - 1; i >= 0; i--) {
    if (this.totalPoints >= levelThresholds[i]) {
      this.level = i;
      break;
    }
  }
};

// Method to add referral points
userSchema.methods.addReferralPoints = function (points, isDirect = true, referredBy = null) {
  this.referralPoints += points;

  if (isDirect) {
    this.directReferrals.push({ username: referredBy, userId: referredBy, pointsEarned: points });
  } else {
    this.indirectReferrals.push({ username: referredBy, userId: referredBy, referredBy, pointsEarned: points });
  }
};

const User = mongoose.model('User', userSchema);

module.exports = User;

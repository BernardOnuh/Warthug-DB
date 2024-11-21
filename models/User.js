const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // User Identity
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  userId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  // Energy System
  energy: {
    type: Number,
    default: 500,
    min: 0
  },
  maxEnergy: {
    type: Number,
    default: 500,
    min: 500
  },
  lastTapTime: {
    type: Date,
    default: Date.now
  },

  // Level & Multiplier Systems
  multiplier: {
    type: Number,
    default: 1,
    min: 1
  },
  speedLevel: {
    type: Number,
    default: 1,
    min: 1
  },
  multiTapLevel: {
    type: Number,
    default: 1,
    min: 1
  },
  energyLimitLevel: {
    type: Number,
    default: 1,
    min: 1
  },

  // Point Systems
  power: {
    type: Number,
    default: 0,
    min: 0
  },
  checkInPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  referralPoints: {
    type: Number,
    default: 0,
    min: 0
  },

  // Check-in System
  lastCheckIn: {
    type: Date,
    default: null
  },
  checkInStreak: {
    type: Number,
    default: 0,
    min: 0
  },

  // Referral System
  referral: {
    type: String,
    default: null,
    trim: true
  },
  directReferrals: [{
    username: {
      type: String,
      required: true
    },
    userId: {
      type: String,
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    pointsEarned: {
      type: Number,
      default: 0,
      min: 0
    }
  }],
  indirectReferrals: [{
    username: {
      type: String,
      required: true
    },
    userId: {
      type: String,
      required: true
    },
    referredBy: {
      type: String,
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    pointsEarned: {
      type: Number,
      default: 0,
      min: 0
    }
  }],

  // Tasks System
  tasksCompleted: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],

  // Game Statistics
  statistics: {
    totalTaps: {
      type: Number,
      default: 0,
      min: 0
    },
    totalPowerGenerated: {
      type: Number,
      default: 0,
      min: 0
    },
    longestCheckInStreak: {
      type: Number,
      default: 0,
      min: 0
    },
    totalCheckIns: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  // Achievements & Badges (for future expansion)
  achievements: [{
    name: String,
    earnedAt: {
      type: Date,
      default: Date.now
    },
    description: String
  }],

  // System Fields
  isActive: {
    type: Boolean,
    default: true
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true  // Automatically adds createdAt and updatedAt fields
});

// Indexes for performance optimization
userSchema.index({ username: 1 });
userSchema.index({ userId: 1 });
userSchema.index({ power: -1 });  // For leaderboard queries
userSchema.index({ referral: 1 }); // For referral queries
userSchema.index({ 'directReferrals.username': 1 });
userSchema.index({ 'indirectReferrals.username': 1 });
userSchema.index({ lastCheckIn: 1 }); // For check-in queries
userSchema.index({ isActive: 1, lastActive: -1 }); // For active user queries

// Virtual for total points (non-persistent field)
userSchema.virtual('totalPoints').get(function() {
  return this.power + this.checkInPoints + this.referralPoints;
});

// Method to check if user can perform daily check-in
userSchema.methods.canCheckIn = function() {
  if (!this.lastCheckIn) return true;
  
  const now = new Date();
  const lastCheck = new Date(this.lastCheckIn);
  
  return now.getUTCDate() !== lastCheck.getUTCDate() ||
         now.getUTCMonth() !== lastCheck.getUTCMonth() ||
         now.getUTCFullYear() !== lastCheck.getUTCFullYear();
};

// Method to calculate current energy including regeneration
userSchema.methods.getCurrentEnergy = function() {
  const currentTime = Date.now();
  const regenRate = 1000 / this.speedLevel;
  const timeDiff = currentTime - this.lastTapTime;
  const energyToRegenerate = Math.floor(timeDiff / regenRate);
  
  return Math.min(this.energy + energyToRegenerate, this.maxEnergy);
};

// Pre-save middleware to update statistics
userSchema.pre('save', function(next) {
  if (this.isModified('checkInStreak')) {
    this.statistics.longestCheckInStreak = Math.max(
      this.statistics.longestCheckInStreak,
      this.checkInStreak
    );
  }
  
  if (this.isModified('power')) {
    this.statistics.totalPowerGenerated = this.power;
  }
  
  this.lastActive = new Date();
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
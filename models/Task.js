// models/Task.js
const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  // Basic Task Information
  topic: { 
    type: String, 
    required: true,
    trim: true 
  },
  description: { 
    type: String, 
    required: true,
    trim: true 
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'special', 'event'],
    default: 'daily'
  },

  // Task Requirements
  requiredLevel: {
    type: Number,
    default: 0,
    min: 0
  },
  requiredPoints: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  
  // Task Rewards
  rewardPoints: {
    type: Number,
    required: true,
    min: 0,
    default: 100
  },
  rewardHugPoints: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: (v) => v ? Number(parseFloat(v.toString()).toFixed(4)) : 0
  },

  // Task Media
  imageUrl: {
    type: String,
    trim: true
  },
  link: {
    type: String,
    required: true,
    trim: true
  },

  // Task Timing
  completionDelay: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v > this.createdAt;
      },
      message: 'Expiration date must be after creation date'
    }
  },

  // Task Status
  isActive: {
    type: Boolean,
    default: true
  },
  isRepeatable: {
    type: Boolean,
    default: false
  },
  repeatCooldown: {
    type: Number,
    default: 0,
    min: 0
  },

  // Task Progress Tracking
  totalCompletions: {
    type: Number,
    default: 0,
    min: 0
  },
  uniqueCompletions: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Indexes for efficient querying
TaskSchema.index({ isActive: 1, type: 1 });
TaskSchema.index({ expiresAt: 1 }, { sparse: true });
TaskSchema.index({ requiredLevel: 1 });

// Methods for task status checking
TaskSchema.methods.isAvailable = function() {
  const now = new Date();
  return this.isActive && 
         (!this.expiresAt || this.expiresAt > now);
};

TaskSchema.methods.canBeCompletedBy = function(user) {
  if (!this.isAvailable()) return false;
  if (user.level < this.requiredLevel) return false;
  if (user.totalPoints < this.requiredPoints) return false;
  return true;
};

TaskSchema.methods.getTimeUntilAvailable = function(user, lastCompletionTime) {
  if (!this.isRepeatable) return null;
  if (!lastCompletionTime) return 0;

  const now = new Date();
  const nextAvailableTime = new Date(lastCompletionTime.getTime() + (this.repeatCooldown * 1000));
  return Math.max(0, nextAvailableTime - now);
};

// Static methods for task querying
TaskSchema.statics.getAvailableTasks = async function(user) {
  const now = new Date();
  return this.find({
    isActive: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: now } }
    ],
    requiredLevel: { $lte: user.level },
    requiredPoints: { $lte: user.totalPoints }
  }).sort({ createdAt: -1 });
};

const Task = mongoose.model('Task', TaskSchema);
module.exports = Task;
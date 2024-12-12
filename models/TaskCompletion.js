// models/TaskCompletion.js
const mongoose = require('mongoose');

const TaskCompletionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  completedAt: {
    type: Date,
    default: Date.now
  },
  rewards: {
    points: Number,
    hugPoints: mongoose.Schema.Types.Decimal128
  }
}, {
  timestamps: true
});

// Compound index for unique completions per user/task
TaskCompletionSchema.index({ userId: 1, taskId: 1 });

const TaskCompletion = mongoose.model('TaskCompletion', TaskCompletionSchema);
module.exports = TaskCompletion;
const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  topic: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String // Optional: URL of an image related to the task
  },
  power: {
    type: Number,
    required: true // Task requires a certain power level to be completed
  },
  isActive: {
    type: Boolean,
    default: true // Whether the task is still available
  },
  createdAt: {
    type: Date,
    default: Date.now // Timestamp for when the task was created
  },
  expiresAt: {
    type: Date // Optional: Expiration date of the task
  },
  completionDelay: {
    type: Number,
    required: true,
    default: 0 // Delay before the task can be marked as completed
  },
  link: {
    type: String,
    required: true // Link associated with the task (could be an external resource)
  }
});

const Task = mongoose.model('Task', TaskSchema);

module.exports = Task;

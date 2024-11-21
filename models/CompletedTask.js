// models/CompletedTask.js
const mongoose = require('mongoose');

const CompletedTaskSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task', // Assuming Task is another model you have defined
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming User is another model you have defined
    required: true,
  },
  completedAt: {
    type: Date,
    default: Date.now,
  },
});

const CompletedTask = mongoose.model('CompletedTask', CompletedTaskSchema);

module.exports = CompletedTask;

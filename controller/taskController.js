const Task = require('../models/Task');
const User = require('../models/User');
const mongoose = require('mongoose');

// Get all tasks for a specific user (excluding completed ones)
exports.getTasksForUser = async (req, res) => {
  try {
    const { username } = req.params;

    // Find the user by username
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Find tasks that are active and not completed by the user
    const tasks = await Task.find({
      isActive: true,
      _id: { $nin: user.tasksCompleted }, // Exclude completed tasks
    });

    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get a specific task by ID
exports.getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;

    // Validate if taskId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a new task
exports.createTask = async (req, res) => {
  try {
    const { topic, description, imageUrl, power, expiresAt, completionDelay, link } = req.body;

    const newTask = new Task({
      topic,
      description,
      imageUrl,
      power,
      expiresAt,
      completionDelay,
      link
    });

    await newTask.save();
    res.status(201).json({ success: true, data: newTask });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update a task by ID
exports.updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    // Validate if taskId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    const updates = req.body;

    const updatedTask = await Task.findByIdAndUpdate(taskId, updates, { new: true });

    if (!updatedTask) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.json({ success: true, data: updatedTask });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete a task by ID
exports.deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    // Validate if taskId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    const deletedTask = await Task.findByIdAndDelete(taskId);

    if (!deletedTask) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create multiple tasks at once
exports.createMultipleTasks = async (req, res) => {
  try {
    const tasks = req.body; // Expect an array of task objects
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ success: false, message: 'Expected an array of tasks' });
    }

    const createdTasks = await Task.insertMany(tasks);
    res.status(201).json({ success: true, data: createdTasks });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getCompletedTasks = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username }).populate('tasksCompleted');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user.tasksCompleted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.completeTask = async (req, res) => {
  try {
    const { telegramUserId, taskId } = req.params;

    // Validate taskId
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    // Find the user by telegramUserId
    const user = await User.findOne({ userId: telegramUserId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Find the task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Check if the task is already completed by the user
    if (user.tasksCompleted.includes(taskId)) {
      return res.status(400).json({ success: false, message: 'Task already completed by this user' });
    }

    // Add the task to the user's completed tasks
    user.tasksCompleted.push(taskId);

    // Add the task's power to the user's power
    user.power += task.power;

    // Save the updated user
    await user.save();

    // Optionally, you might want to update the task itself (e.g., decrease available slots)
    // This depends on your specific requirements

    res.json({ success: true, message: 'Task completed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

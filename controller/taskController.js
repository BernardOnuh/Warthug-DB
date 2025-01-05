// controllers/taskController.js
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const User = require('../models/User');
const mongoose = require('mongoose');

// Get tasks for a specific user
exports.getTasksForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find user and their completions
    const [user, completions] = await Promise.all([
      User.findOne({ userId }),
      TaskCompletion.find({ userId })
    ]);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Get all active tasks
    const tasks = await Task.find({ isActive: true });
    
    // Process and filter tasks
    const processedTasks = tasks.reduce((acc, task) => {
      const lastCompletion = completions.find(c => c.taskId.equals(task._id));
      const isCompleted = !!lastCompletion;

      // Skip completed non-repeatable tasks
      if (isCompleted && !task.isRepeatable) {
        return acc;
      }

      const canComplete = task.canBeCompletedBy(user);
      const timeUntilAvailable = task.getTimeUntilAvailable(user, lastCompletion?.completedAt);

      // Only add tasks that are either:
      // 1. Not completed
      // 2. Repeatable and available (cooldown passed)
      if (!isCompleted || (task.isRepeatable && timeUntilAvailable === 0)) {
        acc.push({
          ...task.toObject(),
          isCompleted,
          canComplete,
          lastCompletedAt: lastCompletion?.completedAt,
          timeUntilAvailable,
          userEligible: user.level >= task.requiredLevel && user.totalPoints >= task.requiredPoints
        });
      }

      return acc;
    }, []);

    res.json({ 
      success: true, 
      data: processedTasks,
      user: {
        level: user.level,
        totalPoints: user.totalPoints
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all tasks
exports.getAllTasks = async (req, res) => {
  try {
    const { isActive, type, requiredLevel } = req.query;
    
    let query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (type) {
      query.type = type;
    }
    
    if (requiredLevel !== undefined) {
      query.requiredLevel = { $lte: parseInt(requiredLevel) };
    }
    
    const tasks = await Task.find(query)
      .sort({ createdAt: -1 });
    
    const taskStats = {
      total: tasks.length,
      active: tasks.filter(t => t.isActive).length,
      byType: tasks.reduce((acc, task) => {
        acc[task.type] = (acc[task.type] || 0) + 1;
        return acc;
      }, {}),
      totalCompletions: tasks.reduce((sum, task) => sum + task.totalCompletions, 0),
      uniqueCompletions: tasks.reduce((sum, task) => sum + task.uniqueCompletions, 0)
    };
    
    res.json({
      success: true,
      stats: taskStats,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get task by ID
exports.getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    let userStatus = null;
    if (userId) {
      const [user, completion] = await Promise.all([
        User.findOne({ userId }),
        TaskCompletion.findOne({ userId, taskId })
      ]);

      if (user) {
        userStatus = {
          canComplete: task.canBeCompletedBy(user),
          isCompleted: !!completion,
          lastCompletedAt: completion?.completedAt,
          timeUntilAvailable: task.getTimeUntilAvailable(user, completion?.completedAt),
          userEligible: user.level >= task.requiredLevel && user.totalPoints >= task.requiredPoints
        };
      }
    }

    res.json({ 
      success: true, 
      data: task,
      userStatus 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a new task
exports.createTask = async (req, res) => {
  try {
    const taskData = {
      ...req.body,
      createdAt: new Date()
    };

    // Validate required fields
    const requiredFields = ['topic', 'description', 'type', 'requiredPoints', 'rewardPoints', 'link'];
    const missingFields = requiredFields.filter(field => !taskData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const newTask = new Task(taskData);
    await newTask.save();

    res.status(201).json({ 
      success: true, 
      message: 'Task created successfully',
      data: newTask 
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update a task
exports.updateTask = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    const task = await Task.findById(taskId).session(session);
    if (!task) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Check if we're deactivating a task
    if (req.body.isActive === false && task.isActive) {
      req.body.deactivatedAt = new Date();
    }

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      { $set: req.body },
      { new: true, runValidators: true, session }
    );

    await session.commitTransaction();
    res.json({ 
      success: true, 
      message: 'Task updated successfully',
      data: updatedTask 
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// Delete a task
exports.deleteTask = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    // Delete task and its completions
    const [deletedTask, deletedCompletions] = await Promise.all([
      Task.findByIdAndDelete(taskId).session(session),
      TaskCompletion.deleteMany({ taskId }).session(session)
    ]);

    if (!deletedTask) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    await session.commitTransaction();
    res.json({ 
      success: true, 
      message: 'Task and related completions deleted successfully',
      deletedCompletions: deletedCompletions.deletedCount 
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// Create multiple tasks
exports.createMultipleTasks = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tasks = req.body;
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Expected an array of tasks' 
      });
    }

    // Validate all tasks before insertion
    const requiredFields = ['topic', 'description', 'type', 'requiredPoints', 'rewardPoints', 'link'];
    const invalid = tasks.find(task => 
      requiredFields.some(field => !task[field])
    );

    if (invalid) {
      return res.status(400).json({
        success: false,
        message: 'All tasks must contain required fields'
      });
    }

    const createdTasks = await Task.insertMany(
      tasks.map(task => ({
        ...task,
        createdAt: new Date()
      })),
      { session }
    );

    await session.commitTransaction();
    res.status(201).json({ 
      success: true, 
      message: `Successfully created ${createdTasks.length} tasks`,
      data: createdTasks 
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// Get completed tasks
exports.getCompletedTasks = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const [completions, total] = await Promise.all([
      TaskCompletion.find({ userId })
        .populate('taskId')
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      TaskCompletion.countDocuments({ userId })
    ]);

    const formattedCompletions = completions.map(completion => ({
      task: completion.taskId,
      completedAt: completion.completedAt,
      rewards: completion.rewards
    }));

    res.json({
      success: true,
      data: formattedCompletions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Complete a task
exports.completeTask = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    const [user, task] = await Promise.all([
      User.findOne({ userId }).session(session),
      Task.findById(taskId).session(session)
    ]);

    if (!user || !task) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false, 
        message: !user ? 'User not found' : 'Task not found' 
      });
    }

    if (!task.canBeCompletedBy(user)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'Task cannot be completed' 
      });
    }

    const existingCompletion = await TaskCompletion.findOne({
      userId: user.userId,
      taskId: task._id
    }).session(session);

    if (existingCompletion && !task.isRepeatable) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'Task already completed' 
      });
    }

    if (existingCompletion) {
      const timeUntilAvailable = task.getTimeUntilAvailable(user, existingCompletion.completedAt);
      if (timeUntilAvailable > 0) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: `Task available in ${Math.ceil(timeUntilAvailable / 1000)} seconds` 
        });
      }
    }

    // Create completion record
    const completion = new TaskCompletion({
      userId: user.userId,
      taskId: task._id,
      rewards: {
        points: task.rewardPoints,
        hugPoints: task.rewardHugPoints
      }
    });

    // Update user rewards
    user.tapPoints += task.rewardPoints;
    if (task.rewardHugPoints > 0) {
      user.hugPoints = Number((parseFloat(user.hugPoints.toString()) + 
        parseFloat(task.rewardHugPoints.toString())).toFixed(4));
    }

    // Update task statistics
    task.totalCompletions += 1;
    if (!existingCompletion) {
      task.uniqueCompletions += 1;
    }

    // Save all changes
    await Promise.all([
      completion.save({ session }),
      user.save({ session }),
      task.save({ session })
    ]);

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Task completed successfully',
      rewards: {
        points: task.rewardPoints,
        hugPoints: task.rewardHugPoints
      },
      newTotals: {
        tapPoints: user.tapPoints,
        hugPoints: user.hugPoints,
        totalPoints: user.totalPoints
      }
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

module.exports = exports;
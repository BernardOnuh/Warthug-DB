const express = require('express');
const router = express.Router();
const {
  registerUser,
  handleTap,
  awardHourlyPoints,
  upgradeTapPower,
  upgradeEnergyLimit,
  getReferralDetails,
  getLeaderboard,
  monitorUserStatus
} = require('../controller/userController');

const {
  getTasksForUser,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  createMultipleTasks,
  getCompletedTasks,
  completeTask
} = require('../controller/taskController');

// USER ROUTES

// POST: Register a new user
router.post('/register', registerUser);

// PUT: Handle tapping (consume energy and increase points)
router.put('/tap', handleTap);

// PUT: Award hourly points
router.put('/hourly', awardHourlyPoints);

// PUT: Upgrade tap power
router.put('/upgrade/tap-power', upgradeTapPower);

// PUT: Upgrade energy limit
router.put('/upgrade/energy-limit', upgradeEnergyLimit);

// GET: Get referral details
router.get('/referrals/:userId', getReferralDetails);

// GET: Get leaderboard (type = points or referrals)
router.get('/leaderboard', getLeaderboard);

// GET: Monitor user status by userId
router.get('/status/:userId', monitorUserStatus);

// TASK ROUTES

// GET: Get all tasks for a specific user
router.get('/tasks/:username', getTasksForUser);

// GET: Get a specific task by its ID
router.get('/task/:taskId', getTaskById);

// POST: Create a new task
router.post('/task', createTask);

// PUT: Update a specific task by its ID
router.put('/task/:taskId', updateTask);

// DELETE: Delete a task by its ID
router.delete('/task/:taskId', deleteTask);

// POST: Create multiple tasks
router.post('/tasks', createMultipleTasks);

// GET: Get all completed tasks for a specific user
router.get('/tasks/completed/:username', getCompletedTasks);

// POST: Mark a task as completed
router.post('/complete/:telegramUserId/:taskId', completeTask);

module.exports = router;

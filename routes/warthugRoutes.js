// routes/index.js
const express = require('express');
const router = express.Router();

// Import Controllers
const {
  registerUser,
  handleTap,
  awardHourlyPoints,
  upgradeTapPower,
  upgradeEnergyLimit,
  getReferralDetails,
  getLeaderboard,
  monitorUserStatus,
  getAllPoints,
  convertToHugPoints,
  claimDaily,
  getDailyClaimInfo,
  startAutoMine,
  claimAutoMineRewards,
  refillEnergy
} = require('../controller/userController');

const {
  createCard,
  getAllCards,
  upgradeCard,
  getCardDetails
} = require('../controller/cardController');

const taskController = require('../controller/taskController');

// USER ROUTES
// Core user functionality
router.post('/register', registerUser);
router.put('/tap', handleTap);
router.put('/hourly', awardHourlyPoints);

// User upgrades
router.put('/upgrade/tap-power', upgradeTapPower);
router.put('/upgrade/energy-limit', upgradeEnergyLimit);

// Auto mining system
router.post('/auto-mine/start', startAutoMine);
router.post('/auto-mine/claim', claimAutoMineRewards);

// Energy management
router.post('/energy/refill', refillEnergy);

// User information and stats
router.get('/referrals/:userId', getReferralDetails);
router.get('/leaderboard', getLeaderboard);
router.get('/status/:userId', monitorUserStatus);
router.get('/points/:userId', getAllPoints);
router.post('/convert-hug-points', convertToHugPoints);

// Daily claim system
router.post('/claim-daily', claimDaily);
router.get('/daily-claim-info/:userId', getDailyClaimInfo);

// CARD SYSTEM ROUTES
// Card management
router.post('/cards/create', createCard);              // Create a new card
router.get('/cards/:userId', getAllCards);             // Get all cards for a user
router.post('/cards/upgrade', upgradeCard);            // Upgrade a specific card
router.get('/cards/:userId/:section/:cardName', getCardDetails);  // Get specific card details

// TASK ROUTES
// Public task endpoints
router.get('/tasks/all', taskController.getAllTasks);
router.get('/tasks/task/:taskId', taskController.getTaskById);

// User-specific task endpoints
router.get('/tasks/user/:userId', taskController.getTasksForUser);
router.get('/tasks/completed/:userId', taskController.getCompletedTasks);
router.post('/tasks/complete/:userId/:taskId', taskController.completeTask);

// Task management endpoints (admin)
router.post('/tasks/create', taskController.createTask);
router.post('/tasks/batch', taskController.createMultipleTasks);
router.put('/tasks/update/:taskId', taskController.updateTask);
router.delete('/tasks/delete/:taskId', taskController.deleteTask);

module.exports = router;
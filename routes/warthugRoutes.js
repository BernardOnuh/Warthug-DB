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
  getAutoMineStatus,
  claimAutoMineRewards,
  refillEnergy,
  claimStarterBonus,
  checkStarterBonusStatus,
  getReferralRewards,
  claimReferralReward,
  getReferralRankRewardStatus,
  claimReferralRankReward
} = require('../controller/userController');

const {
  createCard,
  getAllCards,
  upgradeCard,
  getCardDetails,
  getAllCardsGlobal
} = require('../controller/cardController');

const taskController = require('../controller/taskController');

const voteController = require('../controller/voteController');

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
router.get('/auto-mine/status/:userId', getAutoMineStatus);

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
router.post('/cards/create', createCard);
router.get('/cards', getAllCardsGlobal);               // Create a new card
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

// VOTING SYSTEM ROUTES
router.get('/vote/events', voteController.getActiveVoteEvents);
router.get('/vote/events/:voteEventId', voteController.getVoteResults);
router.post('/vote/submit', voteController.submitVote);
router.post('/vote/events/create', voteController.createVoteEvent);

router.post('/claim-starter-bonus', claimStarterBonus);
router.get('/starter-bonus/:userId', checkStarterBonusStatus);

router.post('/claim-referral-reward', claimReferralReward);
router.get('/referral-rewards/:userId', getReferralRewards);

router.get('/referral-rank-reward/:userId', getReferralRankRewardStatus);
router.post('/claim-referral-rank-reward', claimReferralRankReward );



module.exports = router;
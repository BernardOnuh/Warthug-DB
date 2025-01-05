const User = require('../models/User');
const mongoose = require('mongoose');

// Register User
const registerUser = async (req, res) => {
  try {
    const { username, userId, referral } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const newUser = new User({ username, userId });

    // Handle referral logic
    if (referral) {
      const referrer = await User.findOne({ username: referral });
      if (!referrer) {
        return res.status(400).json({ message: 'Referral username does not exist' });
      }

      // Add points to referrer
      referrer.referralPoints += 1000000;
      referrer.directReferrals.push({
        username,
        userId,
        pointsEarned: 1000000
      });
      await referrer.save();

      // Handle indirect referrals
      if (referrer.referral) {
        const indirectReferrer = await User.findOne({ username: referrer.referral });
        if (indirectReferrer) {
          indirectReferrer.referralPoints += 100;
          indirectReferrer.indirectReferrals.push({
            username,
            userId,
            referredBy: referral,
            pointsEarned: 100
          });
          await indirectReferrer.save();
        }
      }

      newUser.referral = referral;
    }

    await newUser.save();
    res.status(201).json({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Handle Tap Action
const handleTap = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    try {
      const pointsEarned = user.handleTap();
      await user.save();
      res.status(200).json({ 
        message: 'Tap successful', 
        energy: user.energy, 
        tapPoints: user.tapPoints,
        pointsEarned
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Award Hourly Points
const awardHourlyPoints = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const pointsAwarded = user.awardHourlyPoints();
    await user.save();

    res.status(200).json({ 
      message: 'Hourly points awarded', 
      tapPoints: user.tapPoints,
      pointsAwarded 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Upgrade Tap Power
const upgradeTapPower = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    try {
      user.upgradeTapPower();
      await user.save();
      res.status(200).json({ 
        message: 'Tap power upgraded', 
        perTap: user.perTap, 
        tapPoints: user.tapPoints,
        nextUpgradeCost: user.upgradeCosts.perTap
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Upgrade Energy Limit
const upgradeEnergyLimit = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    try {
      user.upgradeEnergyLimit();
      await user.save();
      res.status(200).json({ 
        message: 'Energy limit upgraded', 
        maxEnergy: user.maxEnergy, 
        tapPoints: user.tapPoints,
        nextUpgradeCost: user.upgradeCosts.maxEnergy
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Start Auto Mining
const startAutoMine = async (req, res) => {
  const { userId, duration } = req.body;
  
  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    try {
      user.startAutoMine(duration || 7200000); // Default 2 hours
      await user.save();
      
      res.status(200).json({
        message: 'Auto mining started successfully',
        autoMine: {
          isActive: true,
          startTime: user.autoMineStartTime,
          endTime: new Date(user.autoMineStartTime.getTime() + user.autoMineDuration),
          duration: user.autoMineDuration,
          pendingPoints: 0
        },
        energy: user.getCurrentEnergy(),
        maxEnergy: user.maxEnergy
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Claim Auto Mine Rewards
const claimAutoMineRewards = async (req, res) => {
  const { userId } = req.body;
  
  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    try {
      const pointsClaimed = user.claimAutoMineRewards();
      await user.save();
      
      res.status(200).json({
        message: 'Auto mine rewards claimed successfully',
        pointsClaimed,
        newTapPoints: user.tapPoints,
        totalPoints: user.totalPoints,
        autoMine: {
          isActive: user.isAutoMining,
          pendingPoints: 0,
          continueMining: true,
          timeRemaining: user.isAutoMining ? 
            Math.max(0, user.autoMineDuration - (Date.now() - user.autoMineStartTime)) : 0
        }
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

const monitorUserStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Process auto mining if active
    if (user.isAutoMining) {
      // Process and auto-claim if it's been an hour
      const pendingPoints = user.processAutoMine();
      if (pendingPoints > 0) {
        try {
          const claimedPoints = user.claimAutoMineRewards();
          user.tapPoints += claimedPoints;
        } catch (error) {
          console.error('Auto-claim error:', error);
        }
      }
    }

    user.energy = user.getCurrentEnergy();
    user.lastActive = Date.now();
    await user.save();

    // Rest of the response remains the same
    res.status(200).json({
      username: user.username,
      userId: user.userId,
      energy: user.energy,
      maxEnergy: user.maxEnergy,
      perTap: user.perTap,
      tapPoints: user.tapPoints,
      perHour: user.perHour,
      level: user.level,
      totalPoints: user.totalPoints,
      referralPoints: user.referralPoints,
      lastHourlyAward: user.lastHourlyAward,
      hugPoints: Number(parseFloat(user.hugPoints.toString()).toFixed(4)),
      upgradeCosts: {
        tapPowerCost: user.upgradeCosts.perTap,
        energyLimitCost: user.upgradeCosts.maxEnergy,
        energyUpgradeCost: 0
      },
      dailyClaimInfo: {
        streak: user.dailyClaimStreak,
        nextClaimAmount: user.nextDailyClaimAmount,
        canClaim: user.canClaimDaily(),
        lastClaim: user.lastDailyClaim,
        streakWeek: Math.floor(user.dailyClaimStreak / 7) + 1,
        dayInWeek: (user.dailyClaimStreak % 7) + 1
      },
      autoMine: {
        isActive: user.isAutoMining,
        startTime: user.autoMineStartTime,
        endTime: user.isAutoMining ? 
          new Date(user.autoMineStartTime.getTime() + user.autoMineDuration) : 
          user.lastAutoMineEnd,
        timeRemaining: user.isAutoMining ? 
          Math.max(0, user.autoMineDuration - (Date.now() - user.autoMineStartTime)) : 0,
        pendingPoints: user.pendingAutoMinePoints,
        claimHistory: user.autoClaimHistory
      },
      referralInfo: {
        directCount: user.directReferrals.length,
        indirectCount: user.indirectReferrals.length,
        totalReferralPoints: user.referralPoints
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Get Referral Details
const getReferralDetails = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const referralDetails = {
      directReferrals: user.directReferrals.map(ref => ({
        username: ref.username,
        userId: ref.userId,
        pointsEarned: ref.pointsEarned,
        joinedAt: ref.joinedAt
      })),
      indirectReferrals: user.indirectReferrals.map(ref => ({
        username: ref.username,
        userId: ref.userId,
        referredBy: ref.referredBy,
        pointsEarned: ref.pointsEarned,
        joinedAt: ref.joinedAt
      })),
      totalReferralPoints: user.referralPoints,
      myReferralCode: user.username
    };

    res.status(200).json({ 
      message: 'Referral details retrieved successfully', 
      referralDetails 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Get Leaderboard
const getLeaderboard = async (req, res) => {
  const { type = 'points', userId } = req.query;

  try {
    const leaderboardData = await User.getLeaderboardWithDetails(type, userId);

    res.status(200).json({
      message: 'Leaderboard retrieved successfully',
      type,
      data: {
        leaderboard: leaderboardData.leaderboard,
        userPosition: leaderboardData.userPosition,
        totalParticipants: leaderboardData.total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get All Points Info
const getAllPoints = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const pointsInfo = user.getAllPointsInfo();
    res.status(200).json({
      message: 'Points information retrieved successfully',
      pointsInfo
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Convert to Hug Points
const convertToHugPoints = async (req, res) => {
  const { userId, pointsToConvert } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    try {
      const newHugPoints = user.convertToHugPoints(pointsToConvert);
      await user.save();
      
      res.status(200).json({
        message: 'Points converted successfully',
        convertedHugPoints: newHugPoints,
        currentStats: user.getAllPointsInfo()
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Daily Claim System
const claimDaily = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    try {
      const claimResult = user.processDailyClaim();
      await user.save();
      
      res.status(200).json({
        message: 'Daily reward claimed successfully',
        data: {
          claimedAmount: claimResult.claimedAmount,
          currentStreak: claimResult.newStreak,
          nextClaimAmount: claimResult.nextClaimAmount,
          tapPoints: user.tapPoints,
          nextClaimAvailable: new Date(user.lastDailyClaim.getTime() + 24 * 60 * 60 * 1000)
        }
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Get Daily Claim Info
const getDailyClaimInfo = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const canClaim = user.canClaimDaily();
    const nextClaimAmount = user.calculateDailyClaimAmount();
    const currentStreak = user.dailyClaimStreak;
    
    let nextClaimTime = null;
    if (!canClaim && user.lastDailyClaim) {
      nextClaimTime = new Date(user.lastDailyClaim.getTime() + 24 * 60 * 60 * 1000);
    }

    res.status(200).json({
      message: 'Daily claim info retrieved successfully',
      data: {
        canClaim,
        currentStreak,
        nextClaimAmount,
        nextClaimTime,
        streakWeek: Math.floor(currentStreak / 7) + 1,
        dayInWeek: (currentStreak % 7) + 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Energy Refill
const refillEnergy = async (req, res) => {
  const { userId } = req.body;
  
  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    try {
      const newEnergy = user.refillEnergy();
      await user.save();
      
      res.status(200).json({
        message: 'Energy refilled successfully',
        username: user.username,
        currentEnergy: newEnergy,
        maxEnergy: user.maxEnergy,
        totalRefills: user.totalEnergyRefills,
        lastRefill: user.lastEnergyRefill,
        cooldownEnds: new Date(user.lastEnergyRefill.getTime() + 300000) // 5 minutes cooldown
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Get Auto Mine Status
const getAutoMineStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    const recentClaims = user.autoClaimHistory
      .filter(claim => (now - claim.claimTime) <= (60 * 60 * 1000))
      .map(claim => ({
        time: claim.claimTime,
        points: claim.pointsClaimed
      }));

    res.status(200).json({
      message: 'Auto mine status retrieved successfully',
      data: {
        isActive: user.isAutoMining,
        startTime: user.autoMineStartTime,
        endTime: user.isAutoMining ? 
          new Date(user.autoMineStartTime.getTime() + user.autoMineDuration) : 
          user.lastAutoMineEnd,
        timeRemaining: user.isAutoMining ? 
          Math.max(0, user.autoMineDuration - (now - user.autoMineStartTime)) : 0,
        pendingPoints: user.pendingAutoMinePoints,
        recentClaims,
        totalClaimsToday: user.autoClaimHistory.filter(claim => 
          claim.claimTime.toDateString() === now.toDateString()
        ).length
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Export all controller functions
module.exports = {
  registerUser,
  handleTap,
  awardHourlyPoints,
  upgradeTapPower,
  upgradeEnergyLimit,
  startAutoMine,
  claimAutoMineRewards,
  getAutoMineStatus,
  monitorUserStatus,
  refillEnergy,
  getReferralDetails,
  getLeaderboard,
  getAllPoints,
  convertToHugPoints,
  claimDaily,
  getDailyClaimInfo
};
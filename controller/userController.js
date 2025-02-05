const User = require('../models/User');
const mongoose = require('mongoose');


// Update registration to not auto-award points
const registerUser = async (req, res) => {
  try {
    const { username, userId, referral, isVerified } = req.body;
 
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }
 
    const newUser = new User({
      username,
      userId,
      tapPoints: 100000,
      hasClaimedStarterBonus: true,
      directReferrals: [],
      indirectReferrals: [],
      claimedReferrals: [],
      isVerified
    });
 
    if (referral) {
      const referrer = await User.findOne({ username: referral });
      if (!referrer) {
        return res.status(400).json({ message: 'Referral username does not exist' });
      }
 
      referrer.directReferrals.push({
        username,
        userId,
        isVerified: newUser.isVerified
      });
      await referrer.save();
 
      newUser.referral = referral;
 
      // Handle indirect referrals
      if (referrer.referral) {
        const indirectReferrer = await User.findOne({ username: referrer.referral });
        if (indirectReferrer) {
          indirectReferrer.indirectReferrals.push({
            username,
            userId,
            referredBy: referral,
            isVerified: newUser.isVerified
          });
          await indirectReferrer.save();
        }
      }
    }
 
    await newUser.save();
    res.status(201).json({ 
      message: 'User registered successfully', 
      user: newUser 
    });
 
  } catch (error) {
    console.error('Detailed error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message,
      stack: error.stack 
    });
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

const monitorUserStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Process auto mining if active
    try {
      if (user.isAutoMining) {
        const pendingPoints = user.processAutoMine();
        if (pendingPoints > 0) {
          const claimedPoints = user.claimAutoMineRewards();
          user.tapPoints += claimedPoints;
        }
      }
    } catch (error) {
      console.error('Auto mining error:', error);
    }

    user.energy = user.getCurrentEnergy();
    user.lastActive = Date.now();
    await user.save();

    // Safely format hugPoints with a default of 0
    const formattedHugPoints = user.hugPoints ? 
      Number(parseFloat(user.hugPoints.toString()).toFixed(4)) : 0;

    // Calculate available for conversion
    const totalPoints = (user.tapPoints || 0) + (user.referralPoints || 0);
    const pointsConverted = user.pointsConverted || 0;
    const availableForConversion = Math.max(0, totalPoints - pointsConverted);

    res.status(200).json({
      username: user.username,
      userId: user.userId,
      energy: user.energy,
      maxEnergy: user.maxEnergy,
      perTap: user.perTap,
      tapPoints: user.tapPoints || 0,
      perHour: user.perHour,
      level: user.level,
      totalPoints: user.totalPoints || 0,
      referralPoints: user.referralPoints || 0,
      lastHourlyAward: user.lastHourlyAward,
      hugPoints: formattedHugPoints,
      pointsConverted: pointsConverted,
      availableForConversion: {
        hugPoints: Number((availableForConversion / 10000).toFixed(4)),
        rawPoints: availableForConversion
      },
      upgradeCosts: user.upgradeCosts || {
        tapPowerCost: 0,
        energyLimitCost: 0,
        energyUpgradeCost: 0
      },
      dailyClaimInfo: {
        streak: user.dailyClaimStreak || 0,
        nextClaimAmount: user.nextDailyClaimAmount || 0,
        canClaim: user.canClaimDaily(),
        lastClaim: user.lastDailyClaim,
        streakWeek: Math.floor((user.dailyClaimStreak || 0) / 7) + 1,
        dayInWeek: ((user.dailyClaimStreak || 0) % 7) + 1
      },
      autoMine: {
        isActive: user.isAutoMining || false,
        startTime: user.autoMineStartTime,
        endTime: user.isAutoMining ? 
          new Date(user.autoMineStartTime.getTime() + user.autoMineDuration) : 
          user.lastAutoMineEnd,
        timeRemaining: user.isAutoMining ? 
          Math.max(0, user.autoMineDuration - (Date.now() - user.autoMineStartTime)) : 0,
        pendingPoints: user.pendingAutoMinePoints || 0,
        claimHistory: user.autoClaimHistory || []
      },
      referralInfo: {
        directCount: (user.directReferrals || []).length,
        indirectCount: (user.indirectReferrals || []).length,
        totalReferralPoints: user.referralPoints || 0
      }
    });
  } catch (error) {
    console.error('Monitor status error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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

const getDailyClaimInfo = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentStreak = user.dailyClaimStreak || 0;
    const canClaim = user.canClaimDaily();
    const hasClaimedToday = user.hasClaimedToday();
    
    // Calculate next claim time
    let nextClaimTime = new Date();
    if (user.lastDailyClaim) {
      nextClaimTime = new Date(user.lastDailyClaim.getTime() + 24 * 60 * 60 * 1000);
    }

    // Calculate streak info
    const streakWeek = Math.max(1, Math.floor(currentStreak / 7) + 1);
    const dayInWeek = currentStreak % 7 + 1;

    const now = new Date();
    const timeUntilNextClaim = Math.max(0, nextClaimTime - now);
    const hoursUntilNextClaim = Math.ceil(timeUntilNextClaim / (1000 * 60 * 60));

    res.status(200).json({
      message: 'Daily claim info retrieved successfully',
      data: {
        canClaim,
        hasClaimedToday,
        currentStreak,
        nextClaimAmount: user.calculateDailyClaimAmount(),
        nextClaimTime: nextClaimTime.toISOString(),
        streakWeek,
        dayInWeek,
        timeUntilNextClaim: hasClaimedToday ? `${hoursUntilNextClaim} hours` : 'Available now',
        rewardTiers: {
          'Week 1 (Days 1-7)': 1000,
          'Week 2 (Days 8-14)': 5000,
          'Week 3 (Days 15-21)': 10000,
          'Week 4 (Days 22-28)': 20000,
          'Week 5 (Days 29-35)': 35000,
          'Week 6+ (Day 36+)': 50000
        }
      }
    });
  } catch (error) {
    console.error('Daily claim info error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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

// Move all function definitions above the exports
const startAutoMine = async (req, res) => {
  const { userId } = req.body;
  
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.startAutoMine();
    await user.save();
    
    res.status(200).json({
      message: 'Auto mining started successfully',
      autoMine: {
        isActive: true,
        startTime: user.autoMineStartTime,
        endTime: new Date(user.autoMineStartTime.getTime() + user.autoMineDuration),
        duration: user.autoMineDuration,
        ratePerHour: user.autoMineRate,
        pendingPoints: 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
 };
 
 const getAutoMineStatus = async (req, res) => {
  const { userId } = req.params;
 
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });
 
    const now = new Date();
    const timeRemaining = user.isAutoMining ? 
      Math.max(0, user.autoMineDuration - (now - user.autoMineStartTime)) : 0;
 
    res.status(200).json({
      isActive: user.isAutoMining,
      ratePerHour: user.autoMineRate,
      pendingPoints: user.pendingAutoMinePoints,
      startTime: user.autoMineStartTime,
      endTime: user.isAutoMining ? 
        new Date(user.autoMineStartTime.getTime() + user.autoMineDuration) : 
        user.lastAutoMineEnd,
      timeRemaining,
      lastClaim: user.lastAutoMineClaim
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
 };
 
 const claimAutoMineRewards = async (req, res) => {
  const { userId } = req.body;
  
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const pointsClaimed = user.claimAutoMineRewards();
    await user.save();
    
    res.status(200).json({
      message: 'Auto mine rewards claimed successfully',
      pointsClaimed,
      newTapPoints: user.tapPoints,
      newAutoMine: {
        isActive: true,
        startTime: user.autoMineStartTime,
        ratePerHour: user.autoMineRate
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
 };

const claimStarterBonus = async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.hasClaimedStarterBonus) {
      return res.status(400).json({ message: 'Starter bonus already claimed' });
    }

    user.tapPoints += 10000;
    user.hasClaimedStarterBonus = true;
    await user.save();

    res.status(200).json({
      message: 'Starter bonus claimed successfully',
      tapPoints: user.tapPoints
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

const checkStarterBonusStatus = async (req, res) => {
  const { userId } = req.params;
  
  try {
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
      hasClaimedStarterBonus: user.hasClaimedStarterBonus || false,
      eligible: !user.hasClaimedStarterBonus,
      bonusAmount: 10000
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

const claimReferralReward = async (req, res) => {
  const { userId, referralId } = req.body;
  
  try {
    const user = await User.findOne({ userId });
    const referredUser = await User.findOne({ userId: referralId });
 
    if (!user || !referredUser) {
      return res.status(404).json({ message: 'User not found' });
    }
 
    // Check if already claimed
    const alreadyClaimed = user.claimedReferrals?.includes(referralId);
    if (alreadyClaimed) {
      return res.status(400).json({ message: 'Reward already claimed for this referral' });
    }
 
    // Check verification and award points
    const rewardAmount = referredUser.isVerified ? 50000 : 20000;
    user.tapPoints += rewardAmount;
    
    // Track claimed referral
    if (!user.claimedReferrals) user.claimedReferrals = [];
    user.claimedReferrals.push(referralId);
 
    await user.save();
 
    res.status(200).json({
      message: 'Referral reward claimed successfully',
      rewardAmount,
      tapPoints: user.tapPoints
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
 };
 const getReferralRewards = async (req, res) => {
  const { userId } = req.params;
 
  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
 
    const unclaimedReferrals = user.directReferrals.filter(ref => 
      !user.claimedReferrals?.includes(ref.userId)
    );
 
    const totalReward = unclaimedReferrals.reduce((total, ref) => {
      return total + (ref.isVerified ? 50000 : 20000);
    }, 0);
 
    res.status(200).json({
      summary: {
        totalReferrals: unclaimedReferrals.length,
        totalReward,
        referrals: unclaimedReferrals.map(ref => ({
          username: ref.username,
          userId: ref.userId,
          isVerified: ref.isVerified
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
 };

 const claimReferralRankReward = async (req, res) => {
  try {
    const { userId } = req.body;
    console.log('Claiming for userId:', userId);
 
    const user = await User.findOne({ userId });
    if (!user) {
      console.log('User not found with userId:', userId);
      return res.status(404).json({ message: 'User not found' });
    }
 
    const leaderboardData = await User.getLeaderboardWithDetails('referrals', userId);
    const position = leaderboardData.userPosition?.position;
    console.log('User position:', position);
 
    if (!position || position > 30) {
      return res.status(400).json({ 
        message: 'Not eligible for rewards. Must be in top 30.',
        currentPosition: position 
      });
    }
 
    const lastClaim = user.lastReferralRewardClaim;
    const now = new Date();
    
    if (lastClaim && now - lastClaim < 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ 
        message: 'Weekly rewards already claimed',
        nextClaimTime: new Date(lastClaim.getTime() + 7 * 24 * 60 * 60 * 1000)
      });
    }
 
    const rewardAmount = position <= 10 ? 100000 : 50000;
    user.tapPoints += rewardAmount;
    user.lastReferralRewardClaim = now;
    await user.save();
 
    res.status(200).json({
      success: true,
      message: 'Weekly referral rank reward claimed',
      rewardAmount,
      currentPosition: position,
      newTapPoints: user.tapPoints,
      nextClaimTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    });
 
  } catch (error) {
    console.error('Error in claimReferralRankReward:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
 };
 
 const getReferralRankRewardStatus = async (req, res) => {
  try {
    const { userId } = req.params; // Changed from req.query
    
    const user = await User.findOne({ userId });
    console.log('Finding user with ID:', userId);
    
    if (!user) {
      console.log('User not found in DB');
      return res.status(404).json({ message: 'User not found' });
    }

    const leaderboardData = await User.getLeaderboardWithDetails('referrals', userId);
    const position = leaderboardData.userPosition?.position;

    const lastClaim = user.lastReferralRewardClaim;
    const canClaim = !lastClaim || (Date.now() - lastClaim > 7 * 24 * 60 * 60 * 1000);

    res.status(200).json({
      eligible: position <= 30,
      position,
      rewardAmount: position <= 10 ? 100000 : 50000,
      canClaim,
      nextClaimTime: lastClaim ? new Date(lastClaim.getTime() + 7 * 24 * 60 * 60 * 1000) : null,
      leaderboardPosition: leaderboardData.userPosition
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Export all controller functions
module.exports = {
  registerUser,
  handleTap,
  claimStarterBonus,
  checkStarterBonusStatus,
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
  getDailyClaimInfo,
  claimReferralReward,
  getReferralRewards,
  getReferralRankRewardStatus,
  claimReferralRankReward
};
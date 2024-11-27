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
      referrer.referralPoints += 500;
      referrer.directReferrals.push({
        username,
        userId,
        pointsEarned: 500
      });
      await referrer.save();

      // Handle indirect referrals (if any)
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

      // Set referral for the new user
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
      user.handleTap();
      await user.save();
      res.status(200).json({ message: 'Tap successful', energy: user.energy, tapPoints: user.tapPoints });
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

    user.awardHourlyPoints();
    await user.save();

    res.status(200).json({ message: 'Hourly points awarded', tapPoints: user.tapPoints });
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
      res.status(200).json({ message: 'Tap power upgraded', perTap: user.perTap, tapPoints: user.tapPoints });
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
      res.status(200).json({ message: 'Energy limit upgraded', maxEnergy: user.maxEnergy, tapPoints: user.tapPoints });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
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

    res.status(200).json({ message: 'Referral details retrieved successfully', referralDetails });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Get Leaderboard
const getLeaderboard = async (req, res) => {
  const { type } = req.query; // `type` could be 'points', 'referrals', or 'hourly'

  try {
    let leaderboard = [];

    if (type === 'points') {
      // Leaderboard by total points
      leaderboard = await User.find({})
        .sort({ totalPoints: -1 })
        .limit(50)
        .select('username totalPoints');
    } else if (type === 'referrals') {
      // Leaderboard by number of referrals (direct + indirect)
      leaderboard = await User.aggregate([
        {
          $project: {
            username: 1,
            totalReferrals: { $add: [{ $size: '$directReferrals' }, { $size: '$indirectReferrals' }] }
          }
        },
        { $sort: { totalReferrals: -1 } },
        { $limit: 50 }
      ]);
    } else if (type === 'hourly') {
      // Leaderboard by hourly mining points (`perHour`)
      leaderboard = await User.find({})
        .sort({ perHour: -1 })
        .limit(50)
        .select('username perHour');
    } else {
      return res.status(400).json({ message: 'Invalid leaderboard type' });
    }

    res.status(200).json({ message: 'Leaderboard retrieved successfully', type, leaderboard });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};


// Monitor User Status
const monitorUserStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.energy = user.getCurrentEnergy();
    user.lastActive = Date.now();
    await user.save();

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
      lastHourlyAward: user.lastHourlyAward
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

module.exports = {
  registerUser,
  handleTap,
  awardHourlyPoints,
  upgradeTapPower,
  upgradeEnergyLimit,
  getReferralDetails,
  getLeaderboard,
  monitorUserStatus
};

// controllers/cardController.js
const User = require('../models/User');

// Create new card
const createCard = async (req, res) => {
  const { section, cardData } = req.body;
  
  try {
    // Validate required fields
    const requiredFields = [
      'name', 
      'basePrice', 
      'perHourIncrease', 
      'requiredLevel',
      'priceIncreaseRate',
      'perHourIncreaseRate',
      'baseCooldown',
      'cooldownIncreaseRate',
      'imageUrl'
    ];
    
    for (const field of requiredFields) {
      if (!cardData[field]) {
        return res.status(400).json({ 
          message: `Missing required field: ${field}` 
        });
      }
    }

    // Validate section
    const validSections = ['finance', 'predators', 'hogPower'];
    if (!validSections.includes(section)) {
      return res.status(400).json({ 
        message: 'Invalid section. Must be one of: finance, predators, hogPower' 
      });
    }

    // Validate numeric values
    const numericFields = [
      'basePrice',
      'perHourIncrease',
      'requiredLevel',
      'priceIncreaseRate',
      'perHourIncreaseRate',
      'baseCooldown',
      'cooldownIncreaseRate'
    ];

    for (const field of numericFields) {
      if (typeof cardData[field] !== 'number' || cardData[field] <= 0) {
        return res.status(400).json({
          message: `Invalid ${field}. Must be a positive number`
        });
      }
    }

    // Validate image URL
    if (!isValidImageUrl(cardData.imageUrl)) {
      return res.status(400).json({
        message: 'Invalid image URL format'
      });
    }

    // Generate card key
    const cardKey = cardData.name.toLowerCase().replace(/\s+/g, '_');

    // Check for existing card
    const existingCard = await User.findOne({
      [`cards.${section}.${cardKey}`]: { $exists: true }
    });

    if (existingCard) {
      return res.status(400).json({
        message: 'A card with this name already exists in this section'
      });
    }

    // Create new card
    const newCard = {
      ...cardData,
      currentPrice: cardData.basePrice,
      currentPerHour: 0,
      upgradeCount: 0,
      isUnlocked: false,
      currentCooldown: cardData.baseCooldown
    };

    // Add card to all users
    await User.updateMany(
      {},
      { $set: { [`cards.${section}.${cardKey}`]: newCard } }
    );

    res.status(201).json({
      message: 'Card created successfully',
      section,
      cardKey,
      card: newCard
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all cards for a user
const getAllCards = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const cardsInfo = {};
    
    // Process each section's cards
    ['finance', 'predators', 'hogPower'].forEach(section => {
      cardsInfo[section] = {};
      user.cards.get(section)?.forEach((card, cardName) => {
        cardsInfo[section][cardName] = user.getCardInfo(section, cardName);
      });
    });

    res.status(200).json({
      message: 'Cards retrieved successfully',
      userStats: {
        level: user.level,
        tapPoints: user.tapPoints,
        totalPerHour: user.perHour
      },
      cards: cardsInfo
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Upgrade a card
const upgradeCard = async (req, res) => {
  const { userId, section, cardName } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    try {
      await user.upgradeCard(section, cardName);
      await user.save();

      // Get updated card info
      const cardInfo = user.getCardInfo(section, cardName);

      res.status(200).json({
        message: 'Card upgraded successfully',
        card: cardInfo,
        userStats: {
          tapPoints: user.tapPoints,
          perHour: user.perHour,
          level: user.level,
          totalPoints: user.totalPoints
        }
      });

    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get specific card details
const getCardDetails = async (req, res) => {
  const { userId, section, cardName } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const cardInfo = user.getCardInfo(section, cardName);
    if (!cardInfo) {
      return res.status(404).json({ message: 'Card not found' });
    }

    res.status(200).json({
      message: 'Card details retrieved successfully',
      card: cardInfo
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Helper function to validate image URL
function isValidImageUrl(url) {
  if (!url) return false;
  
  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return false;
  }

  // Check if URL ends with common image extensions
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  return imageExtensions.some(ext => url.toLowerCase().endsWith(ext));
}

// Helper function to calculate time until next upgrade
function getTimeUntilNextUpgrade(lastUpgradeTime, cooldownMinutes) {
  if (!lastUpgradeTime) return 0;
  
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const timeSinceUpgrade = Date.now() - new Date(lastUpgradeTime).getTime();
  return Math.max(0, cooldownMs - timeSinceUpgrade);
}

module.exports = {
  createCard,
  getAllCards,
  upgradeCard,
  getCardDetails
};
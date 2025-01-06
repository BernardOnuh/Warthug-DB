const User = require('../models/User');

/**
 * Validates image URL format and extension
 * @param {string} url - The URL to validate
 * @returns {boolean} - Whether URL is valid
 */
function isValidImageUrl(url) {
  if (!url) return false;
  
  try {
    new URL(url);
  } catch {
    return false;
  }

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  return imageExtensions.some(ext => url.toLowerCase().endsWith(ext));
}

/**
 * Calculates time remaining until next upgrade
 */
function getTimeUntilNextUpgrade(lastUpgradeTime, cooldownMinutes) {
  if (!lastUpgradeTime) return 0;
  
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const timeSinceUpgrade = Date.now() - new Date(lastUpgradeTime).getTime();
  return Math.max(0, cooldownMs - timeSinceUpgrade);
}

/**
 * Create new card
 */
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

    const cardKey = cardData.name.toLowerCase().replace(/\s+/g, '_');

    // Create new card with proper structure
    const newCard = {
      name: cardData.name,
      basePrice: cardData.basePrice,
      currentPrice: cardData.basePrice,
      perHourIncrease: cardData.perHourIncrease,
      currentPerHour: 0,
      requiredLevel: cardData.requiredLevel,
      upgradeCount: 0,
      imageUrl: cardData.imageUrl,
      isUnlocked: false,
      priceIncreaseRate: cardData.priceIncreaseRate,
      perHourIncreaseRate: cardData.perHourIncreaseRate,
      baseCooldown: cardData.baseCooldown,
      cooldownIncreaseRate: cardData.cooldownIncreaseRate,
      currentCooldown: cardData.baseCooldown
    };

    // Add card to all users using Map operations
    const users = await User.find();
    for (const user of users) {
      if (!user.cards[section]) {
        user.cards[section] = new Map();
      }
      user.cards[section].set(cardKey, newCard);
      await user.save();
    }

    res.status(201).json({
      success: true,
      message: 'Card created successfully',
      section,
      cardKey,
      card: newCard
    });

  } catch (error) {
    console.error('Error in createCard:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
};

/**
 * Get all cards for a user
 */
const getAllCards = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const cardsInfo = {};
    ['finance', 'predators', 'hogPower'].forEach(section => {
      cardsInfo[section] = {};
      const sectionCards = user.cards[section];
      
      if (sectionCards && sectionCards instanceof Map) {
        sectionCards.forEach((card, cardName) => {
          const cardInfo = user.getCardInfo(section, cardName);
          if (cardInfo) {
            cardsInfo[section][cardName] = cardInfo;
          }
        });
      }
    });

    res.status(200).json({
      success: true,
      message: 'Cards retrieved successfully',
      userStats: {
        level: user.level,
        tapPoints: user.tapPoints,
        totalPerHour: user.perHour
      },
      cards: cardsInfo
    });

  } catch (error) {
    console.error('Error in getAllCards:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
};

/**
 * Upgrade a specific card
 */
const upgradeCard = async (req, res) => {
  const { userId, section, cardName } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    try {
      await user.upgradeCard(section, cardName);
      await user.save();

      const cardInfo = user.getCardInfo(section, cardName);

      res.status(200).json({
        success: true,
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
      res.status(400).json({ 
        success: false,
        message: error.message 
      });
    }
  } catch (error) {
    console.error('Error in upgradeCard:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
};

/**
 * Get details for a specific card
 */
const getCardDetails = async (req, res) => {
  const { userId, section, cardName } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const cardInfo = user.getCardInfo(section, cardName);
    if (!cardInfo) {
      return res.status(404).json({ 
        success: false,
        message: 'Card not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Card details retrieved successfully',
      card: cardInfo
    });

  } catch (error) {
    console.error('Error in getCardDetails:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: error.message 
    });
  }
};

/**
 * Get all cards global information
 */
const getAllCardsGlobal = async (req, res) => {
  try {
    // Get a sample user to extract the card structure
    const sampleUser = await User.findOne();
    if (!sampleUser) {
      return res.status(200).json({
        success: true,
        message: 'No cards found',
        cards: {}
      });
    }

    const cardsInfo = {};
    ['finance', 'predators', 'hogPower'].forEach(section => {
      cardsInfo[section] = {};
      const sectionCards = sampleUser.cards[section];
      
      if (sectionCards && sectionCards instanceof Map) {
        sectionCards.forEach((card, cardName) => {
          cardsInfo[section][cardName] = {
            name: card.name,
            basePrice: card.basePrice,
            perHourIncrease: card.perHourIncrease,
            requiredLevel: card.requiredLevel,
            priceIncreaseRate: card.priceIncreaseRate,
            perHourIncreaseRate: card.perHourIncreaseRate,
            baseCooldown: card.baseCooldown,
            cooldownIncreaseRate: card.cooldownIncreaseRate,
            imageUrl: card.imageUrl,
            section
          };
        });
      }
    });

    res.status(200).json({
      success: true,
      message: 'Cards retrieved successfully',
      cards: cardsInfo
    });

  } catch (error) {
    console.error('Error in getAllCardsGlobal:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  createCard,
  getAllCards,
  upgradeCard,
  getCardDetails,
  getAllCardsGlobal
};
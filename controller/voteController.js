// controllers/voteController.js
const mongoose = require('mongoose');
const VoteEvent = require('../models/Vote');
const User = require('../models/User');

// Create a new voting event
const createVoteEvent = async (req, res) => {
  try {
    const { title, description, choices, endDate, rewardAmount } = req.body;

    const voteEvent = new VoteEvent({
      title,
      description,
      choices: choices.map(choice => ({
        name: choice.name,
        description: choice.description,
        imageUrl: choice.imageUrl,
        votes: 0
      })),
      endDate: new Date(endDate),
      rewardAmount: rewardAmount || 500000
    });

    await voteEvent.save();
    res.status(201).json({
      message: 'Vote event created successfully',
      voteEvent
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating vote event', error: error.message });
  }
};

// Get all active voting events
const getActiveVoteEvents = async (req, res) => {
  try {
    const voteEvents = await VoteEvent.find({
      isActive: true,
      endDate: { $gt: new Date() }
    });

    res.status(200).json({
      message: 'Active vote events retrieved successfully',
      voteEvents
    });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving vote events', error: error.message });
  }
};

// Submit a vote
const submitVote = async (req, res) => {
  const { userId, voteEventId, choiceIndex } = req.body;

  try {
    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find the vote event and user
      const voteEvent = await VoteEvent.findById(voteEventId);
      const user = await User.findOne({ userId });

      if (!voteEvent || !user) {
        throw new Error('Vote event or user not found');
      }

      if (!voteEvent.isActive || voteEvent.endDate < new Date()) {
        throw new Error('Voting event has ended');
      }

      // Record the vote
      voteEvent.recordVote(userId, choiceIndex);
      
      // Award points to the user
      user.tapPoints += voteEvent.rewardAmount;

      // Save both documents
      await Promise.all([
        voteEvent.save({ session }),
        user.save({ session })
      ]);

      await session.commitTransaction();

      res.status(200).json({
        message: 'Vote recorded successfully',
        pointsAwarded: voteEvent.rewardAmount,
        newTapPoints: user.tapPoints,
        voteEvent: {
          title: voteEvent.title,
          choiceVotedFor: voteEvent.choices[choiceIndex].name,
          currentVotes: voteEvent.choices[choiceIndex].votes
        }
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get vote event results
const getVoteResults = async (req, res) => {
  const { voteEventId } = req.params;

  try {
    const voteEvent = await VoteEvent.findById(voteEventId);
    if (!voteEvent) {
      return res.status(404).json({ message: 'Vote event not found' });
    }

    // Calculate total votes
    const totalVotes = voteEvent.choices.reduce((sum, choice) => sum + choice.votes, 0);

    // Calculate percentages and create response
    const results = voteEvent.choices.map(choice => ({
      name: choice.name,
      votes: choice.votes,
      percentage: totalVotes > 0 ? ((choice.votes / totalVotes) * 100).toFixed(2) : 0
    }));

    res.status(200).json({
      message: 'Vote results retrieved successfully',
      voteEvent: {
        title: voteEvent.title,
        description: voteEvent.description,
        totalVotes,
        results,
        isActive: voteEvent.isActive && voteEvent.endDate > new Date(),
        endsAt: voteEvent.endDate
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving vote results', error: error.message });
  }
};

module.exports = {
  createVoteEvent,
  getActiveVoteEvents,
  submitVote,
  getVoteResults
};
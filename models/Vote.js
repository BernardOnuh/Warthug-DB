// models/Vote.js
const mongoose = require('mongoose');

// Choice Schema for individual voting options
const choiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  imageUrl: { type: String, required: true },
  votes: { type: Number, default: 0 }
});

// Vote Event Schema
const voteEventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  rewardAmount: { type: Number, required: true, default: 500000 },
  startDate: { type: Date, required: true, default: Date.now },
  endDate: { type: Date, required: true },
  choices: [choiceSchema],
  // Track who has voted to prevent multiple votes
  voters: [{
    userId: { type: String, required: true },
    choiceIndex: { type: Number, required: true },
    votedAt: { type: Date, default: Date.now }
  }],
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Methods
voteEventSchema.methods.hasUserVoted = function(userId) {
  return this.voters.some(voter => voter.userId === userId);
};

voteEventSchema.methods.recordVote = function(userId, choiceIndex) {
  if (this.hasUserVoted(userId)) {
    throw new Error('User has already voted in this event');
  }

  if (choiceIndex >= this.choices.length) {
    throw new Error('Invalid choice index');
  }

  // Record the vote
  this.choices[choiceIndex].votes += 1;
  this.voters.push({
    userId,
    choiceIndex,
    votedAt: new Date()
  });
};

const VoteEvent = mongoose.model('VoteEvent', voteEventSchema);

module.exports = VoteEvent;
"use strict";

// server/models/Budget.js
// One document per Firebase user — stores their monthly spending limit and
// the alert threshold percentage at which to warn them.

const mongoose = require("mongoose");

const budgetSchema = new mongoose.Schema(
  {
    // Firebase user ID — one budget document per user
    uid: {
      type: String,
      required: [true, "uid is required"],
      unique: true,
      trim: true,
      index: true,
    },

    // Maximum total monthly spending the user wants to stay within (dollars)
    monthlyLimit: {
      type: Number,
      default: 0,
      min: [0, "monthlyLimit must be 0 or greater"],
    },

    // Percentage of monthlyLimit at which to fire a warning (1–100)
    alertThreshold: {
      type: Number,
      default: 80,
      min: [1,   "alertThreshold must be at least 1"],
      max: [100, "alertThreshold cannot exceed 100"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Budget", budgetSchema);

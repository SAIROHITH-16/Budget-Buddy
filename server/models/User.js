// server/models/User.js
// Full manual Mongoose User model for storing user profile information.
// No template. No scaffold. Every field and validator is explicit.
//
// Schema design:
//   Each user document represents a Firebase-authenticated user's profile.
//   The `firebaseUid` field is the unique identifier from Firebase Auth.
//   This model stores additional profile data (name, email, phone) that
//   supplements the Firebase Auth user record.
//
// MongoDB collection name: "users" (pluralised automatically by Mongoose)

"use strict";

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// 1. Define the schema
// ---------------------------------------------------------------------------
const userSchema = new mongoose.Schema(
  {
    // -----------------------------------------------------------------------
    // firebaseUid — Firebase user ID (optional for native-registration users)
    // -----------------------------------------------------------------------
    firebaseUid: {
      type: String,
      required: false,
      unique: true,
      sparse: true,   // allows multiple null values in the unique index
      trim: true,
      index: true,
    },

    // -----------------------------------------------------------------------
    // name — User's full name
    // Required field for user identification and personalization.
    // -----------------------------------------------------------------------
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },

    // -----------------------------------------------------------------------
    // email — User's email address
    // Required for contact and authentication purposes.
    // Basic email format validation included.
    // -----------------------------------------------------------------------
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [
        /^\S+@\S+\.\S+$/,
        "Please provide a valid email address",
      ],
    },

    // -----------------------------------------------------------------------
    // phone — User's phone number (required)
    // -----------------------------------------------------------------------
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      validate: {
        validator: function(v) {
          return /^\+\d{1,4}\d{6,14}$/.test(v);
        },
        message: "Please provide a valid phone number with country code (e.g., +911234567890)",
      },
    },

    // -----------------------------------------------------------------------
    // password — bcrypt-hashed password (only set for native-registration users)
    // -----------------------------------------------------------------------
    password: {
      type: String,
      required: false,
      select: false,  // never returned in queries by default
    },

    // -----------------------------------------------------------------------
    // OTP fields — used during native phone-verification registration
    // -----------------------------------------------------------------------
    otpCode: {
      type:     String,
      required: false,
      select:   false,
    },
    otpExpiry: {
      type:     Date,
      required: false,
      select:   false,
    },

    // -----------------------------------------------------------------------
    // isPhoneVerified — true once the user completes SMS OTP verification
    // -----------------------------------------------------------------------
    isPhoneVerified: {
      type:    Boolean,
      default: false,
    },
  },
  {
    // -----------------------------------------------------------------------
    // Schema options
    // -----------------------------------------------------------------------
    timestamps: true,  // Automatically adds createdAt and updatedAt fields

    // Transform the document when converting to JSON (e.g., for API responses)
    toJSON: {
      transform: function(_doc, ret) {
        // Remove internal Mongoose version key (__v) from responses
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ---------------------------------------------------------------------------
// 2. Pre-save middleware (optional)
// Runs before saving a document to perform validations or transformations.
// ---------------------------------------------------------------------------
userSchema.pre("save", function(next) {
  // Example: You could add additional validation or data transformation here
  // For now, we just proceed to save
  next();
});

// ---------------------------------------------------------------------------
// 3. Instance methods (optional)
// Define custom methods that run on individual user documents.
// ---------------------------------------------------------------------------
userSchema.methods.getPublicProfile = function() {
  // Returns a sanitized profile object without sensitive fields
  return {
    id: this._id,
    firebaseUid: this.firebaseUid,
    name: this.name,
    email: this.email,
    phone: this.phone,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// ---------------------------------------------------------------------------
// 4. Create and export the model
//    Mongoose.model() is idempotent — safe to call multiple times with the
//    same name (useful when hot-reloading in dev).
// ---------------------------------------------------------------------------
const User = mongoose.models.User
  || mongoose.model("User", userSchema);

module.exports = User;

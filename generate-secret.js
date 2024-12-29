const crypto = require("crypto");

// Generate a 32-byte random string and convert to base64
const secret = crypto
  .randomBytes(32)
  .toString("base64")
  // Remove special characters for better compatibility
  .replace(/[+/=]/g, "")
  // Ensure it's at least 32 characters
  .slice(0, 32);

console.log("Generated Secret:", secret);

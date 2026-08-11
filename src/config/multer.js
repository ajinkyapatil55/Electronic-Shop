const multer = require("multer");

// Use memory storage to process file uploads in-memory as buffers
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file limit
  }
});

module.exports = upload;

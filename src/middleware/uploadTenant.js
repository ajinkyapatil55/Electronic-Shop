const multer = require("multer");

// Use memory storage because we process image with sharp
const uploadTenant = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024, // ⬅️ allow up to 10MB input image
  },

  fileFilter: (req, file, cb) => {
    // Accept only images
    if (
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/jpg"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, JPEG, PNG images are allowed"));
    }
  },
});

module.exports = uploadTenant;

const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "..", "uploads", "documents"),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowed.test(file.mimetype.split("/")[1]);
  cb(null, extOk && mimeOk);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const onboardingUpload = upload.fields([
  { name: "license_file", maxCount: 1 },
  { name: "nid_file", maxCount: 1 },
  { name: "registration_file", maxCount: 1 },
  { name: "insurance_file", maxCount: 1 },
]);

const vehicleUpload = upload.fields([
  { name: "registration_file", maxCount: 1 },
  { name: "insurance_file", maxCount: 1 },
]);

const avatarUpload = upload.single("avatar");

module.exports = { onboardingUpload, vehicleUpload, avatarUpload };

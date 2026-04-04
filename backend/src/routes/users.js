const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const { avatarUpload } = require("../middleware/upload");
const {
  getAllUsers,
  getUser,
  updateUser,
  uploadAvatar,
  changePassword,
  deleteUser,
} = require("../controllers/usersController");

router.get("/", authenticateToken, authorizeRoles("admin"), getAllUsers);
router.get("/:userId", authenticateToken, getUser);
router.put("/:userId", authenticateToken, updateUser);
router.post("/:userId/avatar", authenticateToken, (req, res, next) => {
  avatarUpload(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "File too large. Maximum size is 10 MB." });
      }
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    next();
  });
}, uploadAvatar);
router.post("/:userId/change-password", authenticateToken, changePassword);
router.delete("/:userId", authenticateToken, authorizeRoles("admin"), deleteUser);

module.exports = router;

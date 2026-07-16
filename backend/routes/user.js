const express = require("express");
const router = express.Router();
const userctrl = require("../controller/user");
const auth = require('../middleware/auth');

router.post("/inscrire", userctrl.inscrire);
router.post("/seconnecter", userctrl.seconnecter);
router.post("/sedeconnecter", userctrl.sedeconnecter);
// Route publique pour que les clients voient les vendeurs
router.get('/vendeurs', userctrl.getAllVendeurs);

// 🎯 ROUTE : GET /api/auth/me
router.get('/me', auth, userctrl.getProfile);

module.exports = router;
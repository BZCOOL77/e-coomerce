const express = require("express");
const router = express.Router();
const userctrl = require("../controller/user");

router.post("/inscrire", userctrl.inscrire);
router.post("/seconnecter", userctrl.seconnecter);
router.post("/sedeconnecter", userctrl.sedeconnecter);

module.exports = router;
const express = require("express");
const router = express.Router();
const userctrl = require("../controller/user");
const auth = require('../middleware/auth');

router.post("/inscrire", userctrl.inscrire);
router.post("/seconnecter", userctrl.seconnecter);
router.post("/sedeconnecter", userctrl.sedeconnecter);
// Route publique pour que les clients voient les vendeurs
router.get('/vendeurs', userctrl.getAllVendeurs);

// 🎯 ROUTE POUR ENVOYER LES INFOS DU PROFILE UTILISATEUR
router.get('/me', auth, userctrl.getProfile);

// 🎯 ROUTE POUR METTRE À JOUR LES INFOS DU PROFILE UTILISATEUR
router.put('/me', auth, userctrl.updateProfile);

// 🎯 ROUTE POUR CHANGER LE MOT DE PASSE DE L'UTILISATEUR
router.put('/me/password', auth, userctrl.updatePassword);

module.exports = router;
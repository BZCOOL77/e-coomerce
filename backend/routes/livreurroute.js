const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const livreurCtrl = require('../controller/livreurcontroller');
const livreurOnly = require('../middleware/livreuronly');

// Route pour les livreurs : récupérer toutes les commandes "expédiée"
// GET /livreur/expediees
// Protégée par `auth` puis `livreurOnly` pour limiter l'accès aux livreurs
router.get('/expediees', auth, livreurOnly, livreurCtrl.getExpedieesOrders);

// Route pour les livreurs : récupérer l'historique des commandes livrées ou échouées
// GET /livreur/historique
// Protégée par `auth` puis `livreurOnly` pour limiter l'accès aux livreurs
router.get('/historique', auth, livreurOnly, livreurCtrl.getLivreurHistory);

module.exports = router;



const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const vendeurOnly = require('../middleware/vendeuronly');
const orderCtrl = require('../controller/order');

// Route pour acheter (tous les utilisateurs connectés)
router.post('/', auth, orderCtrl.createOrder);

// Route pour voir ses ventes (uniquement les vendeurs)
router.get('/vendeur', auth, vendeurOnly, orderCtrl.getVendeurOrders);

// GESTION DES STATUTS DES COMMANDES
// Le ':id' intercepte l'identifiant de la commande de manière dynamique
router.put('/:id/statut', auth, orderCtrl.updateStatut);


module.exports = router;
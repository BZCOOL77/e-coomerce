const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const vendeurOnly = require('../middleware/vendeuronly');
const orderCtrl = require('../controller/order');

// Route pour acheter (tous les utilisateurs connectés)
router.post('/', auth, orderCtrl.createOrder);

// ⚠️ ROUTES SPÉCIFIQUES AVANT LES ROUTES PARAMÉTRÉES
// Route pour voir ses ventes (uniquement les vendeurs)
router.get('/vendeur', auth, vendeurOnly, orderCtrl.getVendeurOrders);

//ROUTE POUR QUE L'ACHETEUR PUISSE VOIR L'ETAT DE SES COMMANDES
router.get('/acheteur', auth, orderCtrl.getAcheteurOrders);

// Route pour mettre à jour le statut d'un colis complet (groupé par colisGroupId)
router.put('/colis/:colisGroupId/statut', auth, orderCtrl.updateColisStatut);

// ⚠️ ROUTES PARAMÉTRÉES APRÈS
// GESTION DES STATUTS DES COMMANDES
// Le ':id' intercepte l'identifiant de la commande de manière dynamique
router.put('/:id/statut', auth, orderCtrl.updateStatut);

// ROUTE POUR QUE LE VENDEUR PUISSE ANNULER UNE COMMANDE (en changeant le statut à "annulée")
router.put('/:id/annuler', auth, orderCtrl.annulerCommandeParVendeur);

//ROUTE POUR QUE LE CLIENT PUISSE ANNULER UNE COMMANDE (en changeant le statut à "annulée par acheteur")
router.put('/:id/annuler-acheteur', auth, orderCtrl.annulerCommandeParAcheteur);


// 🆕 NOUVELLE ROUTE : Téléchargement du PDF par l'ID du groupe de colis
router.get('/:colisGroupId/invoice', auth, orderCtrl.downloadInvoice);



module.exports = router;


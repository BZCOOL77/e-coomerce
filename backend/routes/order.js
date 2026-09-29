// =============================================================
// ROUTES DES COMMANDES / ORDERS
// =============================================================
// Ce fichier définit tous les endpoints liés aux commandes du marketplace.
//
// Rôle du fichier :
// - créer une commande pour un acheteur
// - récupérer les commandes côté vendeur et côté acheteur
// - mettre à jour le statut d’un colis
// - annuler une commande
// - télécharger une facture PDF
//
// Toutes ces routes passent généralement par le middleware auth pour garantir
// que l’utilisateur est bien connecté.

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const vendeurOnly = require('../middleware/vendeuronly');
const orderCtrl = require('../controller/order');

// -------------------------------------------------------------
// 1. CRÉER UNE COMMANDE
// -------------------------------------------------------------
// POST /orders
// Description :
//   - l’acheteur passe une commande
//   - le backend regroupe les produits par vendeur
//   - il crée la commande parent et les sous-commandes associées
//
// Exemple métier :
//   un client achète deux produits chez deux vendeurs différents
//   -> on crée une commande globale + 2 sous-commandes vendeur
router.post('/', auth, orderCtrl.createOrder);

// -------------------------------------------------------------
// 2. VOIR LES VENTES D’UN VENDEUR
// -------------------------------------------------------------
// GET /orders/vendeur
// Description :
//   - uniquement pour les comptes avec rôle = vendeur
//   - renvoie les colis qui appartiennent à ce vendeur
//
// C’est la route qui permet à un vendeur de voir ses ventes, ses colis,
// et les articles qu’il a livrés ou en cours de préparation.
router.get('/vendeur', auth, vendeurOnly, orderCtrl.getVendeurOrders);

// -------------------------------------------------------------
// 3. VOIR LES COMMANDES D’UN ACHETEUR
// -------------------------------------------------------------
// GET /orders/acheteur
// Description :
//   - l’acheteur connecté récupère ses propres commandes
//   - il peut voir l’état de ses achats
//
// Important : cette route ne montre pas les commandes des autres utilisateurs.
router.get('/acheteur', auth, orderCtrl.getAcheteurOrders);

// -------------------------------------------------------------
// 4. METTRE À JOUR LE STATUT D’UN COLIS
// -------------------------------------------------------------
// PUT /orders/colis/:colisGroupId/statut
// Description :
//   - permet de mettre à jour le statut d’un colis complet
//   - le colis est identifié par colisGroupId
//   - le backend détermine alors la sous-commande concernée
//
// Exemple :
//   - vendeur : mettre le colis en cours / expédié
//   - livreur : prendre en charge / livrer / échec livraison
router.put('/colis/:colisGroupId/statut', auth, orderCtrl.updateColisStatut);

// -------------------------------------------------------------
// 5. ROUTES PARAMÉTRÉES : COMMANDES PAR ID
// -------------------------------------------------------------
// Ce bloc doit être placé après les routes plus spécifiques comme /colis/:id
// parce que Express lit les routes dans l’ordre.
//
// Si on mettait /:id/statut avant /colis/:colisGroupId/statut, la route /colis/...
// pourrait être absorbée par la route générique /:id/statut.

// PUT /orders/:id/statut
// Description :
//   - ancienne route legacy pour mettre à jour le statut d’une commande unique
//   - utilisée par d’anciens front ou fonctions de compatibilité
router.put('/:id/statut', auth, orderCtrl.updateStatut);

// PUT /orders/:id/annuler
// Description :
//   - le vendeur annule une commande
//   - cela remplace le statut par "annulée" si la commande n’est pas déjà dans un flux de livraison
router.put('/:id/annuler', auth, orderCtrl.annulerCommandeParVendeur);

// PUT /orders/:id/annuler-acheteur
// Description :
//   - l’acheteur annule sa propre commande
//   - on vérifie qu’il est bien l’owner de la commande
router.put('/:id/annuler-acheteur', auth, orderCtrl.annulerCommandeParAcheteur);

// -------------------------------------------------------------
// 6. TÉLÉCHARGEMENT DE LA FACTURE PDF
// -------------------------------------------------------------
// GET /orders/:colisGroupId/invoice
// Description :
//   - récupère la facture du colis vendeur identifié par colisGroupId
//   - l’acheteur peut consulter la facture de chacun de ses colis vendeur
//   - un vendeur ne peut télécharger que la facture de son propre colis
//
// Ce téléchargement est utile pour l’export de la facture PDF.
router.get('/:colisGroupId/invoice', auth, orderCtrl.downloadInvoice);



module.exports = router;


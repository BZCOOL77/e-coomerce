// routes/wishlist.js
const express = require('express');
const router = express.Router();
const wishlistCtrl = require('../controller/wishlist'); // Importer le contrôleur des favoris
const auth = require('../middleware/auth'); // Middleware JWT

// 1. Route pour récupérer UNIQUEMENT le tableau d'IDs favoris (Pour l'affichage instantané)
// GET /api/wishlist/user-ids
router.get('/user-ids', auth, wishlistCtrl.getUserWishlistIds);

// POST /api/wishlist/toggle -> Ajouter ou Retirer un favori
router.post('/toggle', auth, wishlistCtrl.toggleWishlist);

// GET /api/wishlist -> Récupérer toute la liste de mes favoris
router.get('/', auth, wishlistCtrl.getUserWishlist);



module.exports = router;
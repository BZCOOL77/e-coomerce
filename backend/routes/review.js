// routes/reviews.js
const express = require('express');
const router = express.Router();
const reviewCtrl = require('../controller/review'); // Importer le contrôleur des avis
const auth = require('../middleware/auth'); // Ton middleware JWT pour vérifier si l'utilisateur est connecté

// Route 1 : Obtenir la moyenne et les avis (Ouvert à TOUT LE MONDE)
// GET /api/reviews/product/65f123456...
router.get('/product/:productId', reviewCtrl.getProductReviews);

// Route 2 : Poster ou modifier un avis (Réservé aux UTILISATEURS CONNECTÉS + ACHETEURS)
// POST /api/reviews
router.post('/', auth, reviewCtrl.addReview);

module.exports = router;
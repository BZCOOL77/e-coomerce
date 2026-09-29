// middleware/idempotency.js
const Order = require('../models/Order');

module.exports = async (req, res, next) => {
  // 1. Récupération de la clé depuis les headers
  const idempotencyKey = req.headers['x-idempotency-key'];

  if (!idempotencyKey) {
    return res.status(400).json({ error: 'Clé d idempotence manquante (Header X-Idempotency-Key requis).' });
  }

  try {
    // 2. Vérification de l'existence d'une commande avec cette même clé
    const existingOrder = await Order.findOne({ idempotencyKey });

    if (existingOrder) {
      // Doublon détecté ! On renvoie directement la commande déjà créée avec un statut 200
      return res.status(200).json({
        message: 'Commande déjà enregistrée (doublon réseau évité).',
        order: existingOrder
      });
    }

    // 3. Si tout est bon, on attache la clé à la requête pour le controller et on passe à la suite
    req.idempotencyKey = idempotencyKey;
    next();

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
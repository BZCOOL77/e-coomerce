// controllers/reviewController.js
const Review = require('../models/review');
const Order = require('../models/Order');
const Thing = require('../models/Thing');
const mongoose = require('mongoose');

// Helper : Validation rapide du format des IDs MongoDB
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

/**
 * 1. POSTER / MODIFIER UN AVIS (Mise à jour atomique des compteurs du produit)
 */
exports.addReview = async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;
    const userId = req.auth?.userId;

    // --- A. Validations strictes ---
    if (!userId) {
      return res.status(401).json({ error: 'Utilisateur non authentifié.' });
    }

    if (!isValidObjectId(productId)) {
      return res.status(400).json({ error: 'Identifiant produit invalide.' });
    }

    const parsedProductId = new mongoose.Types.ObjectId(productId);
    const parsedUserId = new mongoose.Types.ObjectId(userId);
    const note = Number(rating);

    if (!Number.isFinite(note) || note < 1 || note > 5) {
      return res.status(400).json({ error: 'La note doit être comprise entre 1 et 5.' });
    }

    // --- B. Vérification du produit ---
    const productExists = await Thing.findById(parsedProductId);
    if (!productExists) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    // --- C. Vérification de l'achat (Acheteur vérifié) ---
    const userHasBoughtProduct = await Order.findOne({
      acheteurId: parsedUserId,
      produitId: parsedProductId,
      statut: 'livrée'
    });

    if (!userHasBoughtProduct) {
      return res.status(403).json({
        error: 'Accès refusé : Vous devez avoir acheté et reçu ce produit pour laisser un avis.'
      });
    }

    // --- D. Récupération de l'ancien avis AVANT toute mise à jour ---
    // Impératif : On vérifie l'existence exacte en BDD pour distinguer création de modification
    const existingReview = await Review.findOne({
      productId: parsedProductId,
      userId: parsedUserId
    });

    // --- E. Sauvegarde / Mise à jour de l'avis dans la collection Review ---
    const review = await Review.findOneAndUpdate(
      { productId: parsedProductId, userId: parsedUserId },
      { rating: note, comment: comment || '' },
      { new: true, upsert: true, runValidators: true }
    );

    // --- F. Mise à jour atomique des compteurs sur le produit (Thing) ---
    let updatedThing;

    if (!existingReview) {
      // CAS 1 : Premier avis de cet utilisateur pour ce produit (+1 avis, +note à la somme)
      updatedThing = await Thing.findByIdAndUpdate(
        parsedProductId,
        { $inc: { totalRatingSum: note, numReviews: 1 } },
        { new: true }
      );
    } else if (existingReview.rating !== note) {
      // CAS 2 : Modification de la note d'un avis existant (Incrément du Delta)
      const noteDifference = note - existingReview.rating;

      updatedThing = await Thing.findByIdAndUpdate(
        parsedProductId,
        { $inc: { totalRatingSum: noteDifference } },
        { new: true }
      );
    } else {
      // CAS 3 : Seul le commentaire textuel a changé, les compteurs ne bougent pas
      updatedThing = productExists;
    }

    // --- G. Sécurisation anti-négatif et calcul de la moyenne ---
    if (updatedThing) {
      // On garantit mathématiquement qu'aucune valeur ne peut descendre en dessous de zéro
      const safeSum = Math.max(0, updatedThing.totalRatingSum || 0);
      const safeNum = Math.max(0, updatedThing.numReviews || 0);

      const newAverage = safeNum > 0 ? Math.round((safeSum / safeNum) * 10) / 10 : 0;

      // Sauvegarde des valeurs nettoyées sur le document Produit
      updatedThing.totalRatingSum = safeSum;
      updatedThing.numReviews = safeNum;
      updatedThing.averageRating = newAverage;
      await updatedThing.save();
    }

    return res.status(201).json({
      message: 'Votre avis a été enregistré avec succès !',
      review
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * 2. RÉCUPÉRER LES AVIS ET LA MOYENNE D'UN PRODUIT (Lecture ultra-rapide)
 */
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!isValidObjectId(productId)) {
      return res.status(400).json({ error: 'Identifiant produit invalide.' });
    }

    // 1. Récupération directe des compteurs pré-calculés enregistrés dans le produit
    const product = await Thing.findById(productId).select('averageRating numReviews');

    // 2. Récupération de la liste des commentaires textuels triés du plus récent au plus ancien
    const listReviews = await Review.find({ productId })
      .populate('userId', 'nom prenom')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      moyenne: product ? product.averageRating : 0,
      totalAvis: product ? product.numReviews : 0,
      reviews: listReviews
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
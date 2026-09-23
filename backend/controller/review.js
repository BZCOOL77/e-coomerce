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

    // --- B. Vérification de l'achat (Acheteur vérifié) ---
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

    // --- C. Récupération de l'ancien avis AVANT toute mise à jour ---
    // Impératif : On cherche l'état initial en BDD pour savoir s'il s'agit d'une création ou d'une modification
    const existingReview = await Review.findOne({
      productId: parsedProductId,
      userId: parsedUserId
    });

    // --- D. Sauvegarde / Mise à jour de l'avis dans la collection Review + sécurisation transactionnelle ---
    const session = await mongoose.startSession(); // On ouvre une session MongoDB pour sécuriser la mise à jour des données liées.
    let review; // On garde la référence de l'avis créé ou mis à jour pour la réponse finale.

    try {
      // On tente d'exécuter les modifications dans une transaction si MongoDB le supporte.
      await session.withTransaction(async () => {
        // On vérifie que le produit existe dans la même transaction pour éviter d'écrire un avis sur un produit absent.
        const product = await Thing.findById(parsedProductId).session(session);

        // Si le produit n'existe pas, on bloque immédiatement l'opération pour éviter une donnée incohérente.
        if (!product) {
          const productNotFoundError = new Error('Produit introuvable.'); // On crée une erreur métier explicite pour signaler l'absence du produit.
          productNotFoundError.statusCode = 404; // On ajoute un code HTTP dédié à la réponse finale.
          throw productNotFoundError; // On interrompt la transaction pour ne pas créer d'avis invalide.
        }

        // On enregistre ou met à jour l'avis dans la collection Review dans la même transaction.
        review = await Review.findOneAndUpdate(
          { productId: parsedProductId, userId: parsedUserId }, // On cible l'avis unique de cet utilisateur pour ce produit.
          { rating: note, comment: comment || '' }, // On met à jour la note et le commentaire, ou on crée l'avis s'il n'existe pas.
          { returnDocument: 'after', upsert: true, runValidators: true, session } // On renvoie l'avis final, on crée s'il manque et on l'associe à la session.
        );

        // Si c'est le premier avis sur ce produit pour cet utilisateur, on ajoute la note et on incrémente le compteur.
        if (!existingReview) {
          product.totalRatingSum = Number(product.totalRatingSum || 0) + note; // On ajoute la note à la somme globale du produit.
          product.numReviews = Number(product.numReviews || 0) + 1; // On compte cet avis comme un nouvel avis validé.
        } else if (existingReview.rating !== note) {
          // Si l'avis existait déjà et que la note a changé, on replace la somme avec l'ancienne note retirée puis la nouvelle ajoutée.
          product.totalRatingSum = Number(product.totalRatingSum || 0) - Number(existingReview.rating) + note; // On recalcule proprement la somme sans laisser de valeur négative.
        }

        // On recalcule la moyenne uniquement si le produit a au moins un avis.
        if (product.numReviews > 0) {
          const newAverage = product.totalRatingSum / product.numReviews; // On divise la somme totale par le nombre d'avis pour obtenir la moyenne.
          product.averageRating = Number((Math.round(newAverage * 10) / 10).toFixed(1)); // On arrondit la moyenne à une décimale pour la lisibilité.
        } else {
          product.averageRating = 0; // Si le nombre d'avis est nul, la moyenne vaut 0.
        }

        await product.save({ session }); // On sauvegarde le produit avec la session pour que la mise à jour soit cohérente avec l'avis.
      });
    } catch (transactionError) {
      // Si la transaction n'est pas supportée sur la base MongoDB (ex. standalone sans replica set), on retombe sur un comportement standard sans casser le flux.
      if (transactionError && transactionError.message && /replica set|Transaction numbers are only supported/i.test(transactionError.message)) {
        // On réessaie en mode standard sans transaction pour ne pas bloquer l'application sur une base simple.
        const product = await Thing.findById(parsedProductId); // On vérifie à nouveau l'existence du produit sans session.

        if (!product) {
          const productNotFoundError = new Error('Produit introuvable.'); // On reproduit le même signal de produit absent.
          productNotFoundError.statusCode = 404; // On conserve le code HTTP métier attendu.
          throw productNotFoundError; // On stoppe l'opération résolument.
        }

        review = await Review.findOneAndUpdate(
          { productId: parsedProductId, userId: parsedUserId }, // On applique la même mise à jour de l'avis.
          { rating: note, comment: comment || '' }, // On garde la même logique de sauvegarde.
          { returnDocument: 'after', upsert: true, runValidators: true } // On fait la mise à jour sans session avec la bonne option Mongoose.
        );

        if (!existingReview) {
          product.totalRatingSum = Number(product.totalRatingSum || 0) + note; // On ajoute la note comme dans le cas standard.
          product.numReviews = Number(product.numReviews || 0) + 1; // On incrémente le nombre d'avis.
        } else if (existingReview.rating !== note) {
          product.totalRatingSum = Number(product.totalRatingSum || 0) - Number(existingReview.rating) + note; // On corrige la somme totale pour la note précédente et la nouvelle.
        }

        if (product.numReviews > 0) {
          const newAverage = product.totalRatingSum / product.numReviews; // On recalcule la moyenne après modification.
          product.averageRating = Number((Math.round(newAverage * 10) / 10).toFixed(1)); // On arrondit à une décimale.
        } else {
          product.averageRating = 0; // On remet la moyenne à zéro quand il n'y a pas d'avis.
        }

        await product.save(); // On sauvegarde le produit final sans transaction.
      } else {
        throw transactionError; // On relance l'erreur si elle n'est pas liée à un environnement de base non transactionnel.
      }
    } finally {
      await session.endSession(); // On ferme toujours la session pour libérer les ressources MongoDB.
    }

    return res.status(201).json({
      message: 'Votre avis a été enregistré avec succès !',
      review
    });

  } catch (error) {
    const statusCode = error.statusCode || 500; // On sécurise le retour HTTP en utilisant le code métier si présent.
    return res.status(statusCode).json({ error: error.message }); // On renvoie l'erreur pertinente au client, sans casser l'API.
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
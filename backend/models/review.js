//modele pour les avis des clients sur les produits et commentaires sur les produits

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // L'ID du produit évalué
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Thing', 
    required: true 
  },
  // L'ID de l'acheteur qui laisse l'avis
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  // La note sous forme d'étoiles (de 1 à 5)
  rating: { 
    type: Number, 
    required: true, 
    min: 1, 
    max: 5 
  },
  // Le commentaire texte de l'acheteur
  comment: { 
    type: String, 
    trim: true,
    default: '' 
  }
}, { timestamps: true }); // Génère automatiquement createdAt et updatedAt

// 🔒 Sécurité BDD : Empêche un acheteur de publier 2 avis pour le même produit
// (Un tuple productId + userId doit être unique)
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
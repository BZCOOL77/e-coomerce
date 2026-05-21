const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
    //on lie l'acheteur pour pouvoir récupérer son nom et email plus tard
    acheteurId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // On lie le produit pour pouvoir récupérer son nom, image et prix plus tard
    produitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Thing', required: true },
    
    // L'ID du propriétaire du produit (extrait du produit lui-même)
    vendeurId: { type: String, required: true },
    quantite: { type: Number, default: 1 },
    // Le statut permet au vendeur de gérer l'avancement
    statut: { 
    type: String, 
    enum: ['en attente', 'En cours', 'expédiée', 'livrée', 'annulée'], 
    default: 'en attente' },
    dateCommande: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
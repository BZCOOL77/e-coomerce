// =============================================================
// MODELE : Expedition
// =============================================================
// Ce fichier représente le suivi logistique d’un colis d’un vendeur.
//
// Il ne décrit pas toute la commande du client, mais seulement un colis spécifique
// pour un vendeur donné.
//
// Exemple :
// - la commande parent a 2 vendeurs
// - donc il y a 2 Expedition documents distincts
// - chaque Expedition correspond à un colis vendeur unique
//
// C’est ce qui permet au livreur de travailler sur un colis précis,
// sans mélanger les produits de plusieurs vendeurs.
const mongoose = require('mongoose');

const expeditionSchema = new mongoose.Schema({
    // Identifiant unique de ce colis.
    // Il correspond à un colis d’un vendeur donné, pas à toute la commande.
    colisGroupId: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true 
    }, // Ex: "SC-2607-GMB-8492" (1 colis = 1 vendeur)
    
    commandeId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Order', 
        required: true 
    }, // Reference a la commande parent qui porte acheteur, adresse et totaux.

    // Identifiant exact de la sous-commande dans Order.vendorsOrders.
    // Utile pour faire le lien entre la commande parent et le colis voyageur.
    sousCommandeId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    
    vendeur: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    }, // Vendeur/Boutique chez qui récupérer le produit
    
    client: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    }, // Destinataire final

    livreur: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    }, // Livreur qui prend en charge le colis

    // Liste des produits inclus dans ce colis vendeur.
    // Ces produits sont ceux qui appartiennent au vendeur de cette expedition.
    produits: [
        {
            produit: { type: mongoose.Schema.Types.ObjectId, ref: 'Thing' },
            quantite: { type: Number, default: 1 }
        }
    ],

    // Adresse de livraison copiée depuis la commande parent pour que le suivi logistique
    // reste indépendant et exploitable sans devoir faire des jointures constantes.
    adresseLivraison: {
        commune: String,
        quartier: String,
        avenue: String,
        reference: String,
        numeroParcelle: String,
        latitude: Number,
        longitude: Number,
        telephone: String
    },

    // Statut logistique du colis pour le livreur.
    // Le vendeur garde aussi son propre statut dans Order.vendorsOrders[].statutVendeur.
    statut: {
        type: String,
        enum: [
            'attribuéeAlivreur', // Colis reserve/attribue a un livreur
            'prise en charge',   // Livreur a recupere le colis chez le vendeur
            'livrée',            // Colis remis au client
            'échec de livraison' // Absence, refus ou adresse introuvable
        ],
        default: 'prise en charge'
    },

    // Note du livreur pour expliquer un problème de livraison.
    // Exemple : client absent, mauvais numéro, colis endommagé, adresse difficile.
    notesLivreur: { 
        type: String, 
        default: null 
    },

    // Horodatage du cycle de vie du colis.
    // Ces dates permettent de savoir quand le colis a été préparé, pris en charge puis livré.
    horodatage: {
        datePreparation: { type: Date, default: Date.now },
        datePriseEnCharge: { type: Date, default: null },
        dateLivraison: { type: Date, default: null }
    }

}, { timestamps: true });

// Les recherches du livreur et la synchronisation commande/expedition utilisent ce lien.
expeditionSchema.index({ commandeId: 1, sousCommandeId: 1 });

module.exports = mongoose.model('Expedition', expeditionSchema);
// =============================================================
// MODELE : Order
// =============================================================
// Ce fichier décrit LA COMMANDE GLOBALE DU CLIENT dans une marketplace.
//
// Principe simple à retenir :
// - Une commande client n’est pas forcément faite chez un seul vendeur.
// - Un acheteur peut commander des produits de plusieurs vendeurs dans une seule commande.
// - Donc, on garde UNE commande parent pour l’acheteur ET plusieurs sous-commandes
//   dans vendorsOrders, une par vendeur.
//
// Exemple :
// - Acheteur A achète 2 produits : 1 chez Vendeur X, 1 chez Vendeur Y
// - On aura :
//   * Order (commande parent)
//   * vendorsOrders = [sous-commande pour X, sous-commande pour Y]
//
// Cela permet de gérer :
// - les totaux globaux du panier
// - le statut global du panier
// - les colis/logistique de chaque vendeur séparément
//
// =============================================================

const mongoose = require('mongoose');

// -------------------------------------------------------------
// 1. ARTICLE INDIVIDUEL
// -------------------------------------------------------------
// Représente un produit acheté dans une sous-commande.
// On stocke ici les détails financiers de l’article pour le calcul de la facture.
const orderItemSchema = new mongoose.Schema({
    produitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Thing', required: true },
    quantite: { type: Number, default: 1, min: 1 },
    prixUnitaire: { type: Number, required: true },
    prixUnitaireHT: { type: Number, required: true },
    totalHT: { type: Number, required: true },
    montantTVA: { type: Number, required: true },
    totalTTC: { type: Number, required: true },
    // Statut optionnel propre à l’article. Null signifie qu’il hérite du statut du colis vendeur.
    statut: {
        type: String,
        enum: ['en attente', 'En cours', 'expédiée', 'attribuéeAlivreur', 'prise en charge', 'livrée', 'echec de livraison', 'annulée', 'annulée par acheteur'],
        default: null
    }
});

// -------------------------------------------------------------
// 2. SOUS-COMMANDE VENDEUR
// -------------------------------------------------------------
// C’est la vraie unité de gestion pour chaque vendeur.
//
// Exemple :
// - Une commande parent contient 3 vendeurs différents
// - Donc il y a 3 sous-commandes dans vendorsOrders
// - Chacune de ces sous-commandes a :
//   * son vendeurId
//   * ses articles
//   * son statutVendeur
//   * son colisGroupId
//   * son livreurAssignationId
//
// Ce niveau est important car le client voit le statut de son colis par vendeur,
// pas seulement un statut global de toute la commande.
const vendorSubOrderSchema = new mongoose.Schema({
    vendeurId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        get: v => v ? v.toString() : v
    },
    colisGroupId: { type: String, default: null }, // ID du colis pour ce vendeur
    
    // Articles contenus dans le colis de ce vendeur
    items: [orderItemSchema],

    // 🎯 STATUT DU COLIS VENDEUR (Ce que le client voit pour ce vendeur)
    statutVendeur: {
        type: String,
        enum: ['en attente', 'En cours', 'expédiée', 'attribuéeAlivreur', 'prise en charge', 'livrée', 'echec de livraison', 'annulée', 'annulée par acheteur'],
        default: 'en attente'
    },

    // Le livreur assigné à ce colis spécifique du vendeur.
    // Cela permet de savoir qui est responsable de la livraison de cette sous-commande.
    livreurAssignationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    codeOtp: { type: String, default: null },

    // Totaux de cette sous-commande vendeur uniquement.
    // Exemple : si le vendeur X a 3 articles, son sous-total ne contient que ses 3 articles.
    subTotalHT: { type: Number, default: 0 },
    subTotalTVA: { type: Number, default: 0 },
    subTotalTTC: { type: Number, default: 0 }
});

// -------------------------------------------------------------
// 3. COMMANDE GLOBALE
// -------------------------------------------------------------
// C’est le document principal pour toute la transaction client.
// Il contient :
// - l’acheteur
// - la liste des sous-commandes par vendeur
// - les totaux globaux de la facture
// - l’adresse globale de livraison
//
// On voit ici le principe "parent / enfants" :
// Order (parent) -> vendorsOrders (enfants, chacun un vendeur)
const orderSchema = new mongoose.Schema({
    // Clé anti-doublon.
    // Très utile pour empêcher qu’une commande soit enregistrée deux fois à cause d’un retry.
    idempotencyKey: { type: String, required: true, unique: true },

    // L’acheteur qui paie la commande.
    acheteurId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Liste des sous-commandes, une par vendeur.
    // C’est ici que chaque vendeur a son propre colis, ses produits, son statut, son prix, etc.
    vendorsOrders: [vendorSubOrderSchema],

    // Statut global de la commande du point de vue client.
    // Il représente le grand ensemble, pas un colis unique.
    statutGlobal: {
        type: String,
        enum: ['en attente', 'En cours', 'partiellement expédiée', 'expédiée', 'livrée', 'annulée'],
        default: 'en attente'
    },

    // Totaux globaux de la commande, utiles au récapitulatif du panier.
    // Les factures PDF sont ensuite générées séparément pour chaque colis vendeur.
    totalHTGlobal: { type: Number, required: true },
    totalTVAGlobal: { type: Number, required: true },
    totalTTCGlobal: { type: Number, required: true },

    // Adresse de livraison finale pour la commande globale.
    // Même si plusieurs vendeurs sont impliqués, on garde une seule adresse pour le client.
    adresseLivraison: {
        commune: { 
            type: String, 
            required: true,
            enum: ['LUBUMBASHI', 'KATUBA', 'KENYA', 'RUASHI', 'ANNEXE', 'KAMALONDO', 'KAMPEMBA']
        },
        quartier: { type: String, required: true },
        avenue: { type: String, required: true },
        reference: { type: String },
        numeroParcelle: { type: String },
        telephone: { type: String, required: true },
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null }
    },

    dateCommande: { type: Date, default: Date.now },

    // ------------------------------------------------------------------
    // CHAMPS LEGACY
    // ------------------------------------------------------------------
    // Ces champs sont conservés pour rester compatible avec les anciennes commandes.
    // Le système moderne est basé sur vendorsOrders, mais certains anciens documents
    // peuvent encore contenir des données plates (sans sous-commandes).
    //
    // Cela permet d’éviter de casser l’ancien code pendant la migration.
    produitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Thing', required: false },
    vendeurId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        get: v => v ? v.toString() : v
    },
    quantite: { type: Number, default: 1 },
    statut: {
        type: String,
        enum: ['en attente', 'En cours', 'expédiée', 'attribuéeAlivreur', 'prise en charge', 'livrée', 'echec de livraison', 'annulée', 'annulée par acheteur'],
        default: 'en attente'
    },
    items: [orderItemSchema],
    livreurAssignationId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    codeOtp: { type: String, default: null },
    prixUnitaire: { type: Number, required: false },
    prixUnitaireHT: { type: Number, required: false },
    totalHT: { type: Number, required: false },
    montantTVA: { type: Number, required: false },
    totalTTC: { type: Number, required: false },
    colisGroupId: { type: String },
    // Liste de tous les colisGroupId de la commande.
    // Chaque vendeur a son propre colisGroupId.
    colisGroupIds: [{ type: String }]

}, {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
});

module.exports = mongoose.model('Order', orderSchema);
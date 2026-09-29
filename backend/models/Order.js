//MODELE POUR LES COMMANDES

const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
    

    // L'acheteur de la commande globale
    acheteurId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Champs legacy conservés pour compatibilité en lecture/retours front.
    // En mode multi-produit, on s'appuie surtout sur `items`.
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
        enum: ['en attente', 'En cours', 'expédiée','attribuéeAlivreur','prise en charge', 'livrée','echec de livraison', 'annulée', 'annulée par acheteur'],
        default: 'en attente'
    },

    items: [{
        produitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Thing', required: true },
        vendeurId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            get: v => v ? v.toString() : v
        },
        colisGroupId: { type: String, default: null },
        quantite: { type: Number, default: 1 },
        statut: {
            type: String,
            enum: ['en attente', 'En cours', 'expédiée','attribuéeAlivreur','prise en charge', 'livrée','echec de livraison', 'annulée', 'annulée par acheteur'],
            default: 'en attente'
        },
        prixUnitaire: { type: Number, required: true },
        prixUnitaireHT: { type: Number, required: true },
        totalHT: { type: Number, required: true },
        montantTVA: { type: Number, required: true },
        totalTTC: { type: Number, required: true }
    }],

    livreurAssignationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    adresseLivraison: {
        commune: { type: String, required: true,
            enum:['LUBUMBASHI','KATUBA','KENYA','RUASHI','ANNEXE','KAMALONDO', 'KAMPEMBA']
         },
        quartier: { type: String, required: true },
        avenue: { type: String, required: true },
        reference: { type: String },
        numeroParcelle: { type: String },
        telephone: { type: String, required: true },
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null }
    },

    codeOtp: { type: String, default: null },

    prixUnitaire: { type: Number, required: false },
    prixUnitaireHT: { type: Number, required: false },
    totalHT: { type: Number, required: false },
    montantTVA: { type: Number, required: false },
    totalTTC: { type: Number, required: false },
    dateCommande: { type: Date, default: Date.now },
    colisGroupId: { type: String },
    colisGroupIds: [{ type: String }]
}, {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
});

module.exports = mongoose.model('Order', orderSchema);
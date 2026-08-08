//MODELE POUR LES COMMANDES

const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
    //on lie l'acheteur à la commande 
    acheteurId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    //on lie le produit à la commande
    produitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Thing', required: true },
    
    // 🟢 On met le bon type pour les jointures (populate) de ta facture
    vendeurId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        // 🧙‍♂️ L'astuce : force la conversion en String dès qu'on y accède dans le code
        get: v => v ? v.toString() : v 
    },
    quantite: { type: Number, default: 1 },
    statut: { 
        type: String, 
        enum: ['en attente', 'En cours', 'expédiée','attribuéeAlivreur','prise en charge', 'livrée','reçue','echec de livraison', 'annulée', 'annulée par acheteur'], 
        default: 'en attente' 
    },

    // 🔒 Réservation de l’attribution du colis à un livreur précis.
    // Ce champ sert de verrou métier simple pour éviter qu’un même colis
    // ne soit pris en charge par deux livreurs différents.
    livreurAssignationId: {
        type: mongoose.Schema.Types.ObjectId,// On lie le livreur à la commande
        ref: 'User',
        default: null
    },

    adresseLivraison: {
        commune: { type: String, required: true,
            enum:['LUBUMBASHI','KATUBA','KENYA','RUASHI','ANNEXE','KAMALONDO', 'KAMPEMBA']//POUR EVITER LES MALIN QUI MODIFIE LE FRONT-END
         },
        quartier: { type: String, required: true },
        avenue: { type: String, required: true },
        reference: { type: String,  },
        numeroParcelle: { type: String, },
        telephone: { type: String, required: true },
        latitude: { type: Number, default: null },       // Ex: -4.3275
        longitude: { type: Number, default: null }
    },




    prixUnitaire: { type: Number, required: true },
    prixUnitaireHT: { type: Number, required: true },
    totalHT: { type: Number, required: true },
    montantTVA: { type: Number, required: true },
    totalTTC: { type: Number, required: true },
    dateCommande: { type: Date, default: Date.now },
    colisGroupId: { type: String }
}, { 
    timestamps: true,
    toJSON: { getters: true }, // 🚀 Active les getters lors de la conversion en JSON (pour le front)
    toObject: { getters: true } // 🚀 Active les getters dans ton code backend
});

module.exports = mongoose.model('Order', orderSchema);
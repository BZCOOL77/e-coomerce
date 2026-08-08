//MODELE POUR GERER LE WORKLLOW DES LIVRAISONS


const mongoose = require('mongoose');
const { quadraticCurveTo } = require('pdfkit');

const expeditionSchema = new mongoose.Schema({
    // 1. IDENTIFIANTS UNIQUE & RELATIONS
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
    }, // Lien vers le reçu/panier global du client
    
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

    // 2. CONTENU DU PAQUET
    produits: [
        {
            produit: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            quantite: { type: Number, default: 1 }
        }
    ],

    // 3. ADRESSE DE LIVRAISON
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

    // 4. WORKFLOW & STATUTS
    statut: {
        type: String,
        enum: [
            
            'prise en charge',   // Livreur a récupéré le colis chez le vendeur
            'livrée',             // Remis en main propre au client
            'échec de livraison'              // Client absent, refus, adresse introuvable
        ],
        default: 'prise en charge'
    },

   
    

    // 6. DÉTAILS D'ÉCHEC / REMARQUES
    notesLivreur: { 
        type: String, 
        default: null 
    }, // Ex: "Client absent au 1er passage", "Colis endommagé"

    // 7. TRAÇABILITÉ / HORODATAGE (Audit Log)
    // C'est ICI qu'on enregistre l'heure exacte de chaque action du livreur !
    horodatage: {
        datePreparation: { type: Date, default: Date.now },
        datePriseEnCharge: { type: Date, default: null }, // Rempli lors du passage à "PRISE_EN_CHARGE"
        dateLivraison: { type: Date, default: null }       // Rempli lors du passage à "LIVRE"
    }

}, { timestamps: true });

module.exports = mongoose.model('Expedition', expeditionSchema);
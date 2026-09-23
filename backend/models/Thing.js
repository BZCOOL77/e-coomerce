//MODELE POUR PRODUIT 

const mongoose = require('mongoose');

const thingSchema = mongoose.Schema({
    nom : { type: String, required: true },
    description : { type: String, required: true },
    image : { type: String, required: true },
    image1: { type: String, },
    image2: { type: String, },
    image3: { type: String, },
    prix : { type: Number, required: true },
    vendeurId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stock: { type: Number, required: true, default: 10 },
    categorie: { 
        type: String, 
        required: [true, 'La catégorie est obligatoire'],
        trim: true,
        //  catégories autorisées
        enum: ['Électronique', 'Vêtements', 'Alimentation', 'Maison', 'Autres'] 
    },

    // 📊 CHAMPS COMPTEURS (Optimisation) pour avis 
    totalRatingSum: { type: Number, default: 0 }, // somme_notes (ex: 85)
    numReviews: { type: Number, default: 0 },     // nombre_avis (ex: 20)
    averageRating: { type: Number, default: 0 }   // moyenne direct (ex: 4.25)
    
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         

module.exports = mongoose.model('Thing', thingSchema);
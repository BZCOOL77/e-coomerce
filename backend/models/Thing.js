//MODELE POUR PRODUIT 

const mongoose = require('mongoose');

const thingSchema = mongoose.Schema({
    nom : { type: String, required: true },
    description : { type: String, required: true },
    image : { type: String, required: true },
    prix : { type: Number, required: true },
    vendeurId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stock: { type: Number, required: true, default: 10 },
    categorie: { 
        type: String, 
        required: [true, 'La catégorie est obligatoire'],
        trim: true,
        //  catégories autorisées
        enum: ['Électronique', 'Vêtements', 'Alimentation', 'Maison', 'Autres'] 
    }
    
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         

module.exports = mongoose.model('Thing', thingSchema);
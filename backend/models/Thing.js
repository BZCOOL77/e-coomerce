const mongoose = require('mongoose');

const thingSchema = mongoose.Schema({
    nom : { type: String, required: true },
    description : { type: String, required: true },
    image : { type: String, required: true },
    prix : { type: Number, required: true },
    vendeurId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stock: { type: Number, required: true, default: 10 }
    
});

module.exports = mongoose.model('Thing', thingSchema);
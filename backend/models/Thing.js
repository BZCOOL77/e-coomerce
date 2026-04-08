const mongoose = require('mongoose');

const thingSchema = mongoose.Schema({
    nom : { type: String, required: true },
    description : { type: String, required: true },
    image : { type: String, required: true },
    prix : { type: Number, required: true },
    
});

module.exports = mongoose.model('Thing', thingSchema);
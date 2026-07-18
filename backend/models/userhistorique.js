const mongoose = require('mongoose');

const userHistorySchema = mongoose.Schema({
    // On lie l'historique à l'ID de l'utilisateur (sans le changer !)
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    // Qui a fait la modification (l'utilisateur lui-même ou un admin)
    modifierId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    modifierName: { 
        type: String, 
        required: true
    },
    // On stocke précisément ce qui a changé
    oldValues: {
        prenom: { type: String },
        nom: { type: String },
        email: { type: String },
        passwordChanged: { type: Boolean }
    },
    newValues: {
        prenom: { type: String },
        nom: { type: String },
        email: { type: String },
        passwordChanged: { type: Boolean }
    },
    // Date de la modification
    changedAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('UserHistory', userHistorySchema);
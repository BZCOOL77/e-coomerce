const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


// Inscription d'un nouvel utilisateur
exports.inscrire = (req, res, next) => {
    bcrypt.hash(req.body.password, 10)
    .then(hash => {
        const user = new User({
            email: req.body.email,
            password: hash,// on enregistre le mot de passe hashé pour la sécurité
            nom: req.body.nom,
            prenom: req.body.prenom,
            role: req.body.role, // "client" ou "vendeur" récupéré le ton <select> du formulaire d'inscription
        
            //  forcer ces valeurs au départ pour être sûr
            isLicenseActive: false, 
            dateFinLicence: null
            });
            user.save()
            .then(() => res.status(201).json({
                        message: 'Utilisateur créé et connecté !',
                        userId: user._id,
                        role: user.role,// on génère un token dès l'inscription pour connecter directement l'utilisateur après la création de son compte
                        token: jwt.sign(
                            { userId: user._id, role: user.role }, // on inclut aussi le rôle dans le token pour pouvoir l'utiliser dans les middlewares de contrôle d'accès
                            'RANDOM_TOKEN_SECRET',
                            { expiresIn: '24h' }
                        )
                    }))
            .catch(error => res.status(400).json({ error }));
    })
    .catch(error => res.status(500).json({ error }));

};


// Connexion d'un utilisateur existant
exports.seconnecter = (req, res, next) => {
    User.findOne({ email: req.body.email })
    .then(user => {
        if (user === null) {
            return res.status(401).json({ error: 'Utilisateur non trouvé !' });
        }
        bcrypt.compare(req.body.password, user.password)
        .then(valid => {
            if (!valid) {
                return res.status(401).json({ error: 'Mot de passe incorrect !' });
            }
            res.status(200).json({
                userId: user._id,
                role: user.role,// on renvoie aussi le rôle de l'utilisateur pour que le frontend puisse adapter l'interface
                token: jwt.sign(
                    { userId: user._id, role: user.role }, // on inclut aussi le rôle dans le token pour pouvoir l'utiliser dans les middlewares de contrôle d'accès        
                    'RANDOM_TOKEN_SECRET',
                    { expiresIn: '24h' }
                )
            });
        })
        .catch(error => res.status(500).json({ error }));
    })
    .catch(error => res.status(500).json({ error }));
};


// Déconnexion d'un utilisateur
exports.sedeconnecter = (req, res, next) => {};




//recuperer tout les vendeurs


exports.getAllVendeurs = (req, res, next) => {
    // On cherche tous les utilisateurs ayant le rôle 'vendeur'
    User.find({ role: 'vendeur' }, 'nom email') // On ne sélectionne que le nom et l'email
        .then(vendeurs => res.status(200).json(vendeurs))
        .catch(error => res.status(400).json({ error }));
};
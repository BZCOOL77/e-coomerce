const User = require("../models/User");//on importe le modèle User pour interagir avec la base de données
const UserHistory = require("../models/userhistorique");//on importe le modèle UserHistory pour interagir avec la base de données
const bcrypt = require("bcryptjs");//on importe bcrypt pour le hachage des mots de passe
const jwt = require("jsonwebtoken");//on importe jsonwebtoken pour la création de tokens d'authentification


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


// 🟢 Fonction pour récupérer le profil de l'utilisateur connecté pour affichage en cliquant sur le bouton "profile"
exports.getProfile = async (req, res, next) => {
    try {
        // req.auth.userId a été injecté au préalable par ton middleware "auth" !
        // Le ".select('-password')" permet de ne JAMAIS renvoyer le mot de passe sur le réseau.
        const user = await User.findById(req.auth.userId).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: "Utilisateur introuvable dans la base de données !" });
        }

        // On renvoie les infos de l'utilisateur (id, email, etc.)
        res.status(200).json(user);
    } catch (error) {
        console.error("Erreur dans getProfile Controller :", error);
        res.status(500).json({ error: "Une erreur est survenue lors de la récupération du profil." });
    }
};




//FONCTION POUR CHANGER LES INFOS DU PROFILE UTILISATEUR (nom, prenom, email) ET ENREGISTRER L'HISTORIQUE DES MODIFICATIONS
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.auth.userId; // ID sécurisé via le token JWT
        // Le frontend peut envoyer le prénom, le nom, ou l'email (ou les trois !)
        const { prenom, nom, email } = req.body; 
        const allowedFields = ["prenom", "nom", "email"];
        const requestedFields = Object.keys(req.body).filter((key) => allowedFields.includes(key));
        const hasRequestedFields = requestedFields.length > 0;

        // 1. On va chercher l'utilisateur actuel en BDD
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({ message: "Utilisateur introuvable !" });
        }

        // 2. Préparation des objets pour l'historique
        const oldValues = {};
        const newValues = {};
        let hasChanges = false;

        // --- ÉTAPE 3 : ANALYSE STRICTE DES CHAMPS ---

        // On vérifie le Prénom (si fourni et différent)
        if (prenom && prenom !== currentUser.prenom) {
            oldValues.prenom = currentUser.prenom;
            newValues.prenom = prenom;
            currentUser.prenom = prenom; // On prépare la modif en BDD
            hasChanges = true;
        }

        // On vérifie le Nom (si fourni et différent)
        if (nom && nom !== currentUser.nom) {
            oldValues.nom = currentUser.nom;
            newValues.nom = nom;
            currentUser.nom = nom; // On prépare la modif en BDD
            hasChanges = true;
        }

        // On vérifie l'Email (si fourni et différent)
        if (email && email !== currentUser.email) {
            // Sécurité : On vérifie si ce nouvel email n'est pas déjà pris par quelqu'un d'autre
            const emailExists = await User.findOne({ email: email });
            if (emailExists) {
                return res.status(400).json({ error: "Cet adresse email est déjà utilisée par un autre compte ! 🛑" });
            }

            oldValues.email = currentUser.email;
            newValues.email = email;
            currentUser.email = email; // On prépare la modif en BDD
            hasChanges = true;
        }

        // --- ÉTAPE 4 : ENREGISTREMENT ---

        if (hasChanges) {
            // On crée le log d'historique avec le nouveau champ "modifierName"
            const historyLog = new UserHistory({
                userId: currentUser._id,
                modifierId: req.auth.userId,
                // On utilise les infos fraîches ou actuelles pour le nom du modificateur
                modifierName: `${currentUser.prenom} ${currentUser.nom}`.trim(),
                oldValues: oldValues, // Contient uniquement les champs modifiés !
                newValues: newValues  // Contient uniquement les nouvelles valeurs !
            });

            // On sauvegarde le ticket d'historique
            await historyLog.save();

            // On sauvegarde l'utilisateur mis à jour dans la collection 'users'
            await currentUser.save();

            return res.status(200).json({ 
                message: "Profil mis à jour avec succès et historique archivé ! 📑",
                user: {
                    prenom: currentUser.prenom,
                    nom: currentUser.nom,
                    email: currentUser.email
                }
            });
        }

        // Si l'utilisateur a envoyé des champs, mais qu'ils sont strictement identiques à la version actuelle
        if (hasRequestedFields) {
            return res.status(400).json({ message: "Aucune modification détectée. Les valeurs envoyées sont identiques à celles déjà enregistrées." });
        }

        // Si aucun champ autorisé n'a été reçu dans la requête
        return res.status(400).json({ message: "Aucune donnée de profil à mettre à jour n'a été fournie." });

    } catch (error) {
        console.error("Erreur lors de la mise à jour du profil :", error);
        res.status(500).json({ error: "Une erreur est survenue lors de la mise à jour." });
    }
};


//FONCTION POUR CHANGER LE MOT DE PASSE DU PROFILE UTILISATEUR ET ENREGISTRER L'HISTORIQUE DES MODIFICATIONS
exports.updatePassword = async (req, res) => {
    try {
        const userId = req.auth.userId;
        // 📥 On récupère la confirmation envoyée par le frontend
        const { oldPassword, newPassword, confirmPassword } = req.body;

        // --- 🛡️ ÉTAPE 1 : LES VÉRIFICATIONS EXPRESS EN TEXTE BRUT ---

        // 🛑 NOUVELLE SÉCURITÉ : Est-ce que les deux nouveaux mots de passe correspondent ?
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ 
                error: "Le nouveau mot de passe et sa confirmation ne sont pas identiques ! ❌" 
            });
        }

        // 🛑 Sécurité de base : On évite les champs vides
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: "Tous les champs sont obligatoires !" });
        }

        // --- 🔍 ÉTAPE 2 : VÉRIFICATION DU COMPTE EN BDD ---

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "Utilisateur introuvable !" });
        }

        // 🛑 Sécurité fournisseur tiers (Google, Apple...)
        if (user.authProvider && user.authProvider !== 'local') {
            return res.status(400).json({ 
                error: `Votre compte étant géré par ${user.authProvider}, vous ne pouvez pas modifier ce mot de passe ici.` 
            });
        }

        // --- 🔑 ÉTAPE 3 : LES SÉCURITÉS BCRYPT (HASH) ---

        // 🛑 L'ancien mot de passe est-il le bon ?
        const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Le mot de passe actuel est incorrect. Modification refusée ! 🛡️" });
        }

        // 🛑 Le nouveau est-il identique à l'ancien ?
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ error: "Le nouveau mot de passe doit être différent de l'ancien !" });
        }

        // --- 📑 ÉTAPE 4 : ARCHIVAGE & ENREGISTREMENT ---

        // On crée le log (sans stocker de mot de passe)
        const historyLog = new UserHistory({
            userId: user._id,
            modifierId: req.auth.userId,
            modifierName: `${user.prenom} ${user.nom}`.trim(),
            oldValues: { passwordChanged: true },
            newValues: { passwordChanged: true }
        });
        await historyLog.save();

        // Hachage et mise à jour
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.status(200).json({ message: "Votre mot de passe a été modifié avec succès ! 🔒" });

    } catch (error) {
        console.error("Erreur changement mot de passe :", error);
        res.status(500).json({ error: "Impossible de modifier le mot de passe." });
    }
};
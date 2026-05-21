const jwt = require('jsonwebtoken');

// Middleware pour vérifier le token d'authentification
module.exports = (req, res, next) => {
    try {
        const token = req.headers.authorization.split(' ')[1]; // Récupère le token du header
        const decodedToken = jwt.verify(token, 'RANDOM_TOKEN_SECRET'); // Vérifie le token
        const userId = decodedToken.userId;// Récupère l'ID de l'utilisateur à partir du token
        const role = decodedToken.role; // Récupère le rôle de l'utilisateur à partir du token
        req.auth = { userId: userId, role: role };// Ajoute l'ID et le rôle de l'utilisateur à la requête pour les prochaines étapes
        next(); // Passe au middleware suivant
    } catch (error) {
        
        res.status(401).json({ error: 'Requête non authentifiée !' }); // Si le token est invalide ou absent, renvoie une erreur 401
    }
};